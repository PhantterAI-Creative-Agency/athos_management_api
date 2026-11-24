import { Types } from "mongoose";
import { env } from "../config/env";
import { Church } from "../models/Church.model";
import { User } from "../models/User.model";
import { LegalAcceptance } from "../models/LegalAcceptance.model";
import { BillingInvoice } from "../models/BillingInvoice.model";
import { BillingWebhookEvent } from "../models/BillingWebhookEvent.model";
import { AppError } from "../middlewares/errorHandler";
import { auditLogWithCtx } from "../helpers/auditLogger.helper";
import {
  createCustomer,
  createPayment,
  createSubscription,
  deleteSubscription,
  getPayment,
  isAsaasConfigured,
  listSubscriptionPayments,
  type AsaasPayment,
} from "../helpers/asaas.helper";
import { getBillingState, getPlans, planPrice, type BillingState, type PlanDTO, type PlanId } from "../helpers/plans.helper";
import { sendBillingNotice, type BillingNoticeKind } from "../jobs/billingNoticeEmail.job";

const DAY = 86_400_000;
export type BillingType = "UNDEFINED" | "BOLETO" | "PIX";

export interface InvoiceDTO {
  id: string;
  kind: "monthly" | "setup";
  value: number;
  dueDate: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  paidAt?: string;
}

export interface BillingOverviewDTO {
  state: Omit<BillingState, "accessUntil"> & { accessUntil?: string };
  plans: PlanDTO[];
  price: number;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  subscribed: boolean;
  billingType?: BillingType;
  billingConfigured: boolean;
  /** CNPJ do contrato aceito (necessário para emitir as faturas). */
  contractCnpj?: string;
  invoices: InvoiceDTO[];
}

type ChurchDoc = NonNullable<Awaited<ReturnType<typeof loadChurch>>>;

async function loadChurch(churchId: string) {
  const church = await Church.findById(churchId);
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  return church;
}

function toInvoiceDTO(invoice: {
  _id: unknown;
  kind: string;
  value: number;
  dueDate: Date;
  status: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  paidAt?: Date | null;
}): InvoiceDTO {
  return {
    id: String(invoice._id),
    kind: invoice.kind as InvoiceDTO["kind"],
    value: invoice.value,
    dueDate: invoice.dueDate.toISOString(),
    status: invoice.status,
    invoiceUrl: invoice.invoiceUrl ?? undefined,
    bankSlipUrl: invoice.bankSlipUrl ?? undefined,
    paidAt: invoice.paidAt?.toISOString(),
  };
}

/** CNPJ informado pelo representante legal no aceite do contrato (Sprint 1). */
async function contractCnpj(churchId: string): Promise<string | undefined> {
  const record = await LegalAcceptance.findOne({ churchId, documentType: "saas_contract", action: "accept" })
    .sort({ createdAt: -1 })
    .lean();
  return record?.signer?.cnpj ?? undefined;
}

export async function getBillingOverview(churchId: string): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  const state = getBillingState(church.subscription);
  const invoices = await BillingInvoice.find({ churchId }).sort({ dueDate: -1 }).limit(24).lean();
  return {
    state: { ...state, accessUntil: state.accessUntil?.toISOString() },
    plans: getPlans(),
    price: planPrice(state.plan),
    trialEndsAt: church.subscription?.trialEndsAt?.toISOString(),
    currentPeriodEnd: church.subscription?.currentPeriodEnd?.toISOString(),
    subscribed: !!church.subscription?.asaasSubscriptionId && church.subscription?.status !== "canceled",
    billingType: (church.subscription?.billingType as BillingType | undefined) ?? undefined,
    billingConfigured: isAsaasConfigured(),
    contractCnpj: await contractCnpj(churchId),
    invoices: invoices.map(toInvoiceDTO),
  };
}

function invoiceStatus(payment: AsaasPayment): "pending" | "paid" | "overdue" | "refunded" | "canceled" {
  if (payment.deleted) return "canceled";
  if (["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(payment.status)) return "paid";
  if (payment.status === "OVERDUE") return "overdue";
  if (["REFUNDED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE"].includes(payment.status)) return "refunded";
  return "pending";
}

function addMonth(date: Date): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

/** Grava a fatura e ajusta a assinatura conforme o pagamento (sempre consultado no Asaas). */
async function applyPayment(church: ChurchDoc, payment: AsaasPayment, kind: "monthly" | "setup"): Promise<void> {
  const status = invoiceStatus(payment);
  const dueDate = new Date(`${payment.dueDate}T12:00:00Z`);
  const paidAt = payment.paymentDate || payment.confirmedDate ? new Date(`${payment.paymentDate ?? payment.confirmedDate}T12:00:00Z`) : undefined;

  await BillingInvoice.findOneAndUpdate(
    { providerPaymentId: payment.id },
    {
      $set: {
        churchId: church._id,
        kind,
        value: payment.value,
        dueDate,
        status,
        providerStatus: payment.status,
        invoiceUrl: payment.invoiceUrl ?? undefined,
        bankSlipUrl: payment.bankSlipUrl ?? undefined,
        ...(paidAt && status === "paid" ? { paidAt } : {}),
      },
    },
    { upsert: true },
  );

  if (kind !== "monthly" || church.subscription?.status === "canceled") return;

  if (status === "paid") {
    const periodEnd = addMonth(dueDate);
    const current = church.subscription?.currentPeriodEnd;
    church.set("subscription.status", "active");
    church.set("subscription.currentPeriodEnd", current && current > periodEnd ? current : periodEnd);
    church.set("subscription.graceUntil", undefined);
    church.set("subscription.lastNotice", undefined);
  } else if (status === "overdue") {
    const graceUntil = new Date(dueDate.getTime() + env.BILLING_GRACE_DAYS * DAY);
    church.set("subscription.status", "past_due");
    if (!church.subscription?.graceUntil || church.subscription.graceUntil > graceUntil) {
      church.set("subscription.graceUntil", graceUntil);
    }
  }
  await church.save();
}

async function syncSubscriptionInvoices(church: ChurchDoc): Promise<void> {
  const subscriptionId = church.subscription?.asaasSubscriptionId;
  if (!subscriptionId) return;
  const { data } = await listSubscriptionPayments(subscriptionId);
  for (const payment of data ?? []) await applyPayment(church, payment, "monthly");
}

async function ensureCustomer(church: ChurchDoc, email?: string): Promise<string> {
  if (church.subscription?.asaasCustomerId) return church.subscription.asaasCustomerId;
  const cnpj = await contractCnpj(String(church._id));
  if (!cnpj) {
    throw new AppError(409, "CONTRACT_REQUIRED", "O representante legal precisa aceitar o contrato (com o CNPJ) antes da cobrança");
  }
  const customer = await createCustomer({ name: church.name, cpfCnpj: cnpj, email, externalReference: `church:${church._id}` });
  church.set("subscription.asaasCustomerId", customer.id);
  await church.save();
  return customer.id;
}

function assertBillable(church: ChurchDoc): void {
  if (!church.subscription?.plan || church.subscription.exempt) {
    throw new AppError(409, "BILLING_EXEMPT", "Esta igreja está isenta de mensalidade");
  }
}

/** Contrata o plano: cria a assinatura mensal no Asaas, com 1º vencimento no fim do teste. */
export async function subscribe(
  churchId: string,
  userId: string,
  input: { plan: PlanId; billingType: BillingType },
): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  assertBillable(church);
  if (church.subscription?.asaasSubscriptionId && church.subscription.status !== "canceled") {
    throw new AppError(409, "ALREADY_SUBSCRIBED", "A igreja já tem uma assinatura ativa. Use a troca de plano.");
  }
  const admin = await User.findById(userId).select("email").lean();
  const customer = await ensureCustomer(church, admin?.email ?? undefined);

  const now = new Date();
  const trialEnd = church.subscription?.trialEndsAt;
  const inTrial = church.subscription?.status === "trial" && trialEnd && trialEnd > now;
  const firstDue = inTrial ? trialEnd! : now;

  const created = await createSubscription({
    customer,
    value: planPrice(input.plan),
    nextDueDate: firstDue,
    billingType: input.billingType,
    description: `Athos Management — plano ${input.plan === "completo" ? "Completo" : "Essencial"} — ${church.name}`,
    externalReference: `church:${church._id}:monthly`,
  });

  church.set("subscription.plan", input.plan);
  church.set("subscription.asaasSubscriptionId", created.id);
  church.set("subscription.billingType", input.billingType);
  church.set("subscription.canceledAt", undefined);
  if (!inTrial) {
    // Teste já acabou: a 1ª fatura vence hoje e a carência começa agora.
    church.set("subscription.status", "past_due");
    church.set("subscription.graceUntil", new Date(now.getTime() + env.BILLING_GRACE_DAYS * DAY));
  }
  await church.save();
  await syncSubscriptionInvoices(church).catch(() => undefined);

  await auditLogWithCtx({ action: "CREATE", entity: "Subscription", churchId, userId, metadata: { plan: input.plan, billingType: input.billingType } });
  return getBillingOverview(churchId);
}

/**
 * Troca de plano. Como a API do Asaas não documenta a troca do valor de uma assinatura, a antiga
 * é encerrada (o Asaas apaga só as cobranças em aberto) e uma nova começa no mesmo vencimento.
 */
export async function changePlan(churchId: string, userId: string, plan: PlanId): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  assertBillable(church);
  if (church.subscription?.plan === plan) return getBillingOverview(churchId);

  const oldId = church.subscription?.asaasSubscriptionId;
  if (oldId && church.subscription?.status !== "canceled") {
    const pending = await BillingInvoice.findOne({ churchId, kind: "monthly", status: { $in: ["pending", "overdue"] } })
      .sort({ dueDate: 1 })
      .lean();
    const nextDue = pending?.dueDate ?? church.subscription?.currentPeriodEnd ?? church.subscription?.trialEndsAt ?? new Date();

    const created = await createSubscription({
      customer: church.subscription!.asaasCustomerId!,
      value: planPrice(plan),
      nextDueDate: nextDue,
      billingType: (church.subscription?.billingType as BillingType) ?? "UNDEFINED",
      description: `Athos Management — plano ${plan === "completo" ? "Completo" : "Essencial"} — ${church.name}`,
      externalReference: `church:${church._id}:monthly`,
    });
    await deleteSubscription(oldId);
    await BillingInvoice.updateMany({ churchId, kind: "monthly", status: { $in: ["pending", "overdue"] } }, { $set: { status: "canceled" } });
    church.set("subscription.asaasSubscriptionId", created.id);
  }
  church.set("subscription.plan", plan);
  await church.save();
  await syncSubscriptionInvoices(church).catch(() => undefined);

  await auditLogWithCtx({ action: "UPDATE", entity: "Subscription", churchId, userId, metadata: { plan } });
  return getBillingOverview(churchId);
}

/** Cancela: encerra a cobrança; o acesso completo vale até o fim do período pago (ou do teste). */
export async function cancelSubscription(churchId: string, userId: string): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  assertBillable(church);
  if (church.subscription?.asaasSubscriptionId) await deleteSubscription(church.subscription.asaasSubscriptionId);
  await BillingInvoice.updateMany({ churchId, kind: "monthly", status: "pending" }, { $set: { status: "canceled" } });

  const now = new Date();
  const until = church.subscription?.currentPeriodEnd ?? church.subscription?.trialEndsAt ?? now;
  church.set("subscription.status", "canceled");
  church.set("subscription.canceledAt", now);
  church.set("subscription.currentPeriodEnd", until > now ? until : now);
  church.set("subscription.asaasSubscriptionId", undefined);
  await church.save();

  await auditLogWithCtx({ action: "UPDATE", entity: "Subscription", churchId, userId, metadata: { event: "canceled" } });
  return getBillingOverview(churchId);
}

/** Taxa de implantação (cobrança única), lançada pela equipe da plataforma. */
export async function chargeSetupFee(churchId: string, value: number, dueDate: Date): Promise<InvoiceDTO> {
  const church = await loadChurch(churchId);
  const admin = await User.findOne({ churchId, roles: "admin" }).select("email").lean();
  const customer = await ensureCustomer(church, admin?.email ?? undefined);
  const payment = await createPayment({
    customer,
    value,
    dueDate,
    billingType: "UNDEFINED",
    description: `Athos Management — implantação — ${church.name}`,
    externalReference: `church:${church._id}:setup`,
  });
  await applyPayment(church, payment, "setup");
  const invoice = await BillingInvoice.findOne({ providerPaymentId: payment.id }).lean();
  return toInvoiceDTO(invoice!);
}

/** Ajustes da plataforma: plano, isenção e prazo de teste. */
export async function setChurchBilling(
  churchId: string,
  data: { plan?: PlanId; exempt?: boolean; trialDays?: number },
): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  if (data.plan) church.set("subscription.plan", data.plan);
  if (data.exempt !== undefined) church.set("subscription.exempt", data.exempt);
  if (data.trialDays !== undefined) {
    if (!church.subscription?.plan) church.set("subscription.plan", data.plan ?? "essencial");
    church.set("subscription.status", "trial");
    church.set("subscription.trialEndsAt", new Date(Date.now() + data.trialDays * DAY));
  }
  await church.save();
  return getBillingOverview(churchId);
}

/** Assinatura inicial de uma igreja nova: plano escolhido, em teste por TRIAL_DAYS dias. */
export function initialSubscription(plan: PlanId, exempt = false) {
  return { plan, status: "trial" as const, exempt, trialEndsAt: new Date(Date.now() + env.TRIAL_DAYS * DAY) };
}

/**
 * Webhook do Asaas. Deduplica pelo id do evento e nunca confia no corpo: o pagamento é sempre
 * consultado na API antes de mudar qualquer status.
 */
export async function processAsaasEvent(body: { id?: string; event?: string; payment?: { id?: string } }): Promise<{ processed: boolean }> {
  const paymentId = body.payment?.id;
  if (!body.event?.startsWith("PAYMENT_") || !paymentId) return { processed: false };

  if (body.id) {
    try {
      await BillingWebhookEvent.create({ eventId: body.id, event: body.event, paymentId });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) return { processed: false };
      throw error;
    }
  }

  try {
    const payment = await getPayment(paymentId);
    const existing = await BillingInvoice.findOne({ providerPaymentId: payment.id }).lean();
    let churchId = existing ? String(existing.churchId) : undefined;
    let kind: "monthly" | "setup" = (existing?.kind as "monthly" | "setup") ?? "monthly";

    if (!churchId && payment.subscription) {
      const church = await Church.findOne({ "subscription.asaasSubscriptionId": payment.subscription }).select("_id").lean();
      churchId = church ? String(church._id) : undefined;
    }
    const ref = /^church:([0-9a-f]{24}):(monthly|setup)$/.exec(payment.externalReference ?? "");
    if (ref) {
      churchId = churchId ?? ref[1];
      kind = existing ? kind : (ref[2] as "monthly" | "setup");
    }
    if (!churchId || !Types.ObjectId.isValid(churchId)) return { processed: false };

    const church = await Church.findById(churchId);
    if (!church) return { processed: false };
    await applyPayment(church, payment, kind);
    return { processed: true };
  } catch (error) {
    // Libera o evento para a nova tentativa do Asaas.
    if (body.id) await BillingWebhookEvent.deleteOne({ eventId: body.id });
    throw error;
  }
}

/** Avisos por e-mail aos admins quando o estado da assinatura muda (rodar diariamente). */
export async function sendBillingNotices(now = new Date()): Promise<{ sent: number }> {
  const churches = await Church.find({ "subscription.plan": { $exists: true }, "subscription.exempt": { $ne: true } });
  let sent = 0;
  for (const church of churches) {
    const state = getBillingState(church.subscription, now);
    if (!state.warning) continue;
    const key = `${state.warning}:${state.accessUntil?.toISOString().slice(0, 10) ?? ""}`;
    if (church.subscription?.lastNotice === key) continue;
    const admins = await User.find({ churchId: church._id, roles: "admin", active: true }).select("email").lean();
    await sendBillingNotice(admins.flatMap((a) => (a.email ? [a.email] : [])), state.warning as BillingNoticeKind, church.name, state.accessUntil);
    church.set("subscription.lastNotice", key);
    await church.save();
    sent += 1;
  }
  return { sent };
}

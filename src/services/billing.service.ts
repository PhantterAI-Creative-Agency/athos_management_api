import { Types } from "mongoose";
import { env } from "../config/env";
import { Church } from "../models/Church.model";
import { User } from "../models/User.model";
import { LegalAcceptance } from "../models/LegalAcceptance.model";
import { BillingInvoice } from "../models/BillingInvoice.model";
import { AppError } from "../middlewares/errorHandler";
import { auditLogWithCtx } from "../helpers/auditLogger.helper";
import { cancelPayment, createPixPayment, getPayment, type MercadoPagoPayment } from "../helpers/mercadopagoPayments.helper";
import {
  billingNotificationUrl,
  cancelPreapproval,
  createPreapproval,
  getAuthorizedPayment,
  getPreapproval,
  isBillingConfigured,
  platformToken,
  updatePreapprovalAmount,
} from "../helpers/mercadopagoBilling.helper";
import { getBillingState, getPlans, planPrice, type BillingState, type PlanDTO, type PlanId } from "../helpers/plans.helper";
import { sendBillingNotice, type BillingNoticeKind } from "../jobs/billingNoticeEmail.job";

/**
 * Mensalidades das igrejas, cobradas na conta Mercado Pago da PhantterAI. Duas formas:
 * - "pix": a plataforma gera uma fatura PIX perto de cada vencimento;
 * - "card": assinatura do Mercado Pago (preapproval) que cobra o cartão todo mês.
 */

const DAY = 86_400_000;
export type PaymentMethod = "pix" | "card";

export interface InvoiceDTO {
  id: string;
  kind: "monthly" | "setup";
  method: PaymentMethod;
  value: number;
  dueDate: string;
  status: string;
  invoiceUrl?: string;
  pixCopyPaste?: string;
  pixQrCode?: string;
  expiresAt?: string;
  paidAt?: string;
}

export interface BillingOverviewDTO {
  state: Omit<BillingState, "accessUntil"> & { accessUntil?: string };
  plans: PlanDTO[];
  price: number;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  nextDueDate?: string;
  subscribed: boolean;
  paymentMethod?: PaymentMethod;
  /** Assinatura no cartão aguardando o admin informar o cartão no Mercado Pago. */
  cardCheckoutUrl?: string;
  billingConfigured: boolean;
  /** CNPJ do contrato aceito. */
  contractCnpj?: string;
  invoices: InvoiceDTO[];
}

type ChurchDoc = NonNullable<Awaited<ReturnType<typeof loadChurch>>>;

async function loadChurch(churchId: string) {
  const church = await Church.findById(churchId);
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  return church;
}

type InvoiceLike = {
  _id: unknown;
  kind: string;
  method?: string | null;
  value: number;
  dueDate: Date;
  status: string;
  invoiceUrl?: string | null;
  pixCopyPaste?: string | null;
  pixQrCodeBase64?: string | null;
  expiresAt?: Date | null;
  paidAt?: Date | null;
};

function toInvoiceDTO(invoice: InvoiceLike): InvoiceDTO {
  const open = invoice.status === "pending" || invoice.status === "overdue";
  return {
    id: String(invoice._id),
    kind: invoice.kind as InvoiceDTO["kind"],
    method: (invoice.method as PaymentMethod) ?? "pix",
    value: invoice.value,
    dueDate: invoice.dueDate.toISOString(),
    status: invoice.status,
    invoiceUrl: open ? (invoice.invoiceUrl ?? undefined) : undefined,
    pixCopyPaste: open ? (invoice.pixCopyPaste ?? undefined) : undefined,
    pixQrCode: open && invoice.pixQrCodeBase64 ? `data:image/png;base64,${invoice.pixQrCodeBase64}` : undefined,
    expiresAt: invoice.expiresAt?.toISOString(),
    paidAt: invoice.paidAt?.toISOString(),
  };
}

async function contractCnpj(churchId: string): Promise<string | undefined> {
  const record = await LegalAcceptance.findOne({ churchId, documentType: "saas_contract", action: "accept" })
    .sort({ createdAt: -1 })
    .lean();
  return record?.signer?.cnpj ?? undefined;
}

function addMonth(date: Date): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function assertBillable(church: ChurchDoc): void {
  if (!church.subscription?.plan || church.subscription.exempt) {
    throw new AppError(409, "BILLING_EXEMPT", "Esta igreja está isenta de mensalidade");
  }
}

function planName(plan: PlanId) {
  return plan === "completo" ? "Completo" : "Essencial";
}

export async function getBillingOverview(churchId: string): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  await markOverdue(church);
  const state = getBillingState(church.subscription);
  const invoices = await BillingInvoice.find({ churchId }).sort({ dueDate: -1, createdAt: -1 }).limit(24).lean();
  const sub = church.subscription;
  const cardPending = sub?.subscribed && sub.paymentMethod === "card" && sub.mpPreapprovalStatus === "pending";
  return {
    state: { ...state, accessUntil: state.accessUntil?.toISOString() },
    plans: getPlans(),
    price: planPrice(state.plan),
    trialEndsAt: sub?.trialEndsAt?.toISOString(),
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString(),
    nextDueDate: sub?.subscribed ? sub.nextDueDate?.toISOString() : undefined,
    subscribed: !!sub?.subscribed,
    paymentMethod: (sub?.paymentMethod as PaymentMethod | undefined) ?? undefined,
    cardCheckoutUrl: cardPending && sub?.mpPreapprovalId ? await checkoutUrl(sub.mpPreapprovalId) : undefined,
    billingConfigured: isBillingConfigured(),
    contractCnpj: await contractCnpj(churchId),
    invoices: invoices.map(toInvoiceDTO),
  };
}

async function checkoutUrl(preapprovalId: string): Promise<string | undefined> {
  try {
    return (await getPreapproval(preapprovalId)).init_point;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- pagamentos confirmados

/** Aplica um pagamento de mensalidade confirmado/recusado à assinatura. */
async function applyMonthlyResult(church: ChurchDoc, status: "paid" | "failed", dueDate: Date): Promise<void> {
  if (church.subscription?.status === "canceled") return;
  if (status === "paid") {
    const periodEnd = addMonth(dueDate);
    const current = church.subscription?.currentPeriodEnd;
    church.set("subscription.status", "active");
    church.set("subscription.currentPeriodEnd", current && current > periodEnd ? current : periodEnd);
    const next = church.subscription?.nextDueDate;
    if (!next || next <= dueDate) church.set("subscription.nextDueDate", periodEnd);
    church.set("subscription.graceUntil", undefined);
    church.set("subscription.lastNotice", undefined);
  } else {
    const graceUntil = new Date(dueDate.getTime() + env.BILLING_GRACE_DAYS * DAY);
    church.set("subscription.status", "past_due");
    if (!church.subscription?.graceUntil || church.subscription.graceUntil > graceUntil) {
      church.set("subscription.graceUntil", graceUntil);
    }
  }
  await church.save();
}

/** Fatura PIX: consulta o pagamento na API (conta da PhantterAI) e atualiza fatura e assinatura. */
export async function syncPixInvoice(paymentId: string): Promise<boolean> {
  const invoice = await BillingInvoice.findOne({ providerPaymentId: String(paymentId), method: "pix" });
  if (!invoice) return false;
  const payment = await getPayment(platformToken(), String(paymentId));
  if (payment.external_reference && payment.external_reference !== String(invoice._id)) return false;

  let next = invoice.status;
  if (payment.status === "approved" && Math.abs(Number(payment.transaction_amount) - invoice.value) < 0.01) next = "paid";
  else if (payment.status === "refunded" || payment.status === "charged_back") next = "refunded";
  else if (payment.status === "cancelled" || payment.status === "rejected") next = invoice.status === "paid" ? "paid" : "canceled";

  if (next === invoice.status) return false;
  const wasPaid = invoice.status === "paid";
  invoice.status = next;
  invoice.providerStatus = payment.status;
  if (next === "paid") {
    invoice.paidAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
    invoice.pixCopyPaste = undefined;
    invoice.pixQrCodeBase64 = undefined;
  }
  await invoice.save();

  if (next === "paid" && !wasPaid && invoice.kind === "monthly") {
    const church = await loadChurch(String(invoice.churchId));
    await applyMonthlyResult(church, "paid", invoice.dueDate);
  }
  return true;
}

/** Cobrança do cartão (assinatura): registra a fatura e atualiza a assinatura. */
export async function syncCardCharge(authorizedPaymentId: string): Promise<boolean> {
  const charge = await getAuthorizedPayment(String(authorizedPaymentId));
  const church = await Church.findOne({ "subscription.mpPreapprovalId": charge.preapproval_id });
  if (!church) return false;

  const paymentStatus = charge.payment?.status;
  const status = paymentStatus === "approved" ? "paid" : paymentStatus === "rejected" || charge.status === "processed" ? "overdue" : "pending";
  const dueDate = new Date(charge.debit_date ?? charge.date_created ?? Date.now());
  const previous = await BillingInvoice.findOne({ providerPaymentId: `ap_${charge.id}` }).lean();

  await BillingInvoice.findOneAndUpdate(
    { providerPaymentId: `ap_${charge.id}` },
    {
      $set: {
        churchId: church._id,
        kind: "monthly",
        method: "card",
        value: charge.transaction_amount,
        dueDate,
        status: previous?.status === "paid" ? "paid" : status,
        providerStatus: `${charge.status}/${paymentStatus ?? "-"}`,
        ...(status === "paid" && previous?.status !== "paid" ? { paidAt: new Date() } : {}),
      },
    },
    { upsert: true },
  );

  if (status === "paid" && previous?.status !== "paid") await applyMonthlyResult(church, "paid", dueDate);
  if (status === "overdue" && previous?.status !== "paid") await applyMonthlyResult(church, "failed", dueDate);
  return true;
}

/** Mudança de situação da assinatura no cartão (autorizada, cancelada no Mercado Pago, etc.). */
export async function syncPreapproval(preapprovalId: string): Promise<boolean> {
  const church = await Church.findOne({ "subscription.mpPreapprovalId": preapprovalId });
  if (!church) return false;
  const preapproval = await getPreapproval(preapprovalId);
  church.set("subscription.mpPreapprovalStatus", preapproval.status);
  if (preapproval.next_payment_date) church.set("subscription.nextDueDate", new Date(preapproval.next_payment_date));
  if ((preapproval.status === "canceled" || preapproval.status === "cancelled") && church.subscription?.status !== "canceled") {
    // Cancelada no Mercado Pago (pela igreja ou após cobranças recusadas): acesso até o fim do período pago.
    const now = new Date();
    const until = church.subscription?.currentPeriodEnd ?? now;
    church.set("subscription.status", "canceled");
    church.set("subscription.subscribed", false);
    church.set("subscription.canceledAt", now);
    church.set("subscription.currentPeriodEnd", until > now ? until : now);
  }
  await church.save();
  return true;
}

// ---------------------------------------------------------------- faturas PIX

async function payerData(church: ChurchDoc) {
  const email =
    church.subscription?.billingEmail ??
    (await User.findOne({ churchId: church._id, roles: "admin", active: true }).select("email").lean())?.email;
  if (!email) throw new AppError(409, "BILLING_EMAIL_REQUIRED", "A igreja precisa de um administrador com e-mail");
  const cnpj = await contractCnpj(String(church._id));
  return { email, cnpj };
}

/** Gera a fatura PIX de um vencimento. Vale até o fim da carência (no máximo 30 dias). */
async function createPixInvoice(church: ChurchDoc, kind: "monthly" | "setup", value: number, dueDate: Date, description: string) {
  const { email, cnpj } = await payerData(church);
  const invoiceId = new Types.ObjectId();
  const now = new Date();
  const maxExpiry = new Date(now.getTime() + 29 * DAY);
  const graceEnd = new Date(Math.max(dueDate.getTime(), now.getTime()) + env.BILLING_GRACE_DAYS * DAY);
  const expiresAt = graceEnd < maxExpiry ? graceEnd : maxExpiry;

  const payment: MercadoPagoPayment = await createPixPayment(platformToken(), {
    amount: value,
    description,
    externalReference: String(invoiceId),
    payerEmail: email,
    payerIdentification: cnpj ? { type: "CNPJ", number: cnpj } : undefined,
    expiresAt,
    notificationUrl: billingNotificationUrl(),
  });
  const data = payment.point_of_interaction?.transaction_data;
  return BillingInvoice.create({
    _id: invoiceId,
    churchId: church._id,
    kind,
    method: "pix",
    providerPaymentId: String(payment.id),
    value,
    dueDate,
    status: "pending",
    providerStatus: payment.status,
    pixCopyPaste: data?.qr_code,
    pixQrCodeBase64: data?.qr_code_base64,
    invoiceUrl: data?.ticket_url,
    expiresAt,
  });
}

async function openMonthlyInvoice(churchId: Types.ObjectId | string) {
  return BillingInvoice.findOne({ churchId, kind: "monthly", method: "pix", status: { $in: ["pending", "overdue"] } })
    .sort({ dueDate: 1 });
}

/** Fatura em aberto vencida → inadimplência (carência a partir do vencimento). */
async function markOverdue(church: ChurchDoc, now = new Date()): Promise<void> {
  if (!church.subscription?.subscribed || church.subscription.paymentMethod !== "pix") return;
  const open = await openMonthlyInvoice(church._id);
  if (!open || open.dueDate > now) return;
  if (open.status !== "overdue") {
    open.status = "overdue";
    await open.save();
  }
  if (church.subscription.status !== "past_due") await applyMonthlyResult(church, "failed", open.dueDate);
}

/** Gera a fatura do próximo vencimento quando faltam BILLING_INVOICE_DAYS_BEFORE dias. */
async function ensureUpcomingInvoice(church: ChurchDoc, now = new Date()): Promise<void> {
  const sub = church.subscription;
  if (!sub?.subscribed || sub.paymentMethod !== "pix" || !sub.nextDueDate || sub.exempt) return;
  if (sub.nextDueDate.getTime() - now.getTime() > env.BILLING_INVOICE_DAYS_BEFORE * DAY) return;
  const exists = await BillingInvoice.exists({ churchId: church._id, kind: "monthly", method: "pix", dueDate: sub.nextDueDate, status: { $ne: "canceled" } });
  if (exists) return;
  const plan = sub.plan as PlanId;
  await createPixInvoice(church, "monthly", planPrice(plan), sub.nextDueDate, `Athos Management — plano ${planName(plan)} — ${church.name}`);
}

/**
 * "Pagar agora" (PIX): devolve a fatura em aberto; se o PIX dela expirou, gera outro para o mesmo
 * vencimento.
 */
export async function payNow(churchId: string): Promise<InvoiceDTO> {
  const church = await loadChurch(churchId);
  assertBillable(church);
  if (church.subscription?.paymentMethod !== "pix" || !church.subscription.subscribed) {
    throw new AppError(409, "NOT_PIX_SUBSCRIPTION", "A igreja não paga a mensalidade por PIX");
  }
  await ensureUpcomingInvoice(church);
  let open = await openMonthlyInvoice(church._id);
  if (open && open.expiresAt && open.expiresAt <= new Date()) {
    await cancelPayment(platformToken(), open.providerPaymentId).catch(() => undefined);
    open.status = "canceled";
    await open.save();
    const plan = church.subscription.plan as PlanId;
    open = await createPixInvoice(church, "monthly", open.value, open.dueDate, `Athos Management — plano ${planName(plan)} — ${church.name}`);
  }
  if (!open) throw new AppError(404, "NO_OPEN_INVOICE", "Não há mensalidade em aberto no momento");
  return toInvoiceDTO(open);
}

// ---------------------------------------------------------------- contratar, trocar, cancelar

function backUrl(church: ChurchDoc): string {
  const base = (process.env.ADMIN_PANEL_URL ?? "").replace(/\/+$/, "");
  return `${base}/admin_athos/${church.slug}/meu-plano?assinatura=retorno`;
}

/** Contrata o plano por PIX mensal ou cartão. A 1ª cobrança é no fim do teste (ou hoje). */
export async function subscribe(
  churchId: string,
  userId: string,
  input: { plan: PlanId; paymentMethod: PaymentMethod },
): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  assertBillable(church);
  if (church.subscription?.subscribed) {
    throw new AppError(409, "ALREADY_SUBSCRIBED", "A igreja já tem uma assinatura ativa. Use a troca de plano.");
  }
  platformToken();
  if (!(await contractCnpj(churchId))) {
    throw new AppError(409, "CONTRACT_REQUIRED", "O representante legal precisa aceitar o contrato (com o CNPJ) antes da cobrança");
  }
  const admin = await User.findById(userId).select("email").lean();
  if (!admin?.email) throw new AppError(409, "BILLING_EMAIL_REQUIRED", "Cadastre um e-mail no seu perfil");

  const now = new Date();
  const trialEnd = church.subscription?.trialEndsAt;
  const inTrial = church.subscription?.status === "trial" && trialEnd && trialEnd > now;
  const firstDue = inTrial ? trialEnd! : now;

  church.set("subscription.plan", input.plan);
  church.set("subscription.paymentMethod", input.paymentMethod);
  church.set("subscription.billingEmail", admin.email);
  church.set("subscription.nextDueDate", firstDue);
  church.set("subscription.canceledAt", undefined);
  if (!inTrial) {
    church.set("subscription.status", "past_due");
    church.set("subscription.graceUntil", new Date(now.getTime() + env.BILLING_GRACE_DAYS * DAY));
  }

  if (input.paymentMethod === "card") {
    const preapproval = await createPreapproval({
      reason: `Athos Management — plano ${planName(input.plan)} — ${church.name}`,
      externalReference: `church:${church._id}`,
      payerEmail: admin.email,
      amount: planPrice(input.plan),
      startDate: firstDue > now ? firstDue : new Date(now.getTime() + 60_000),
      backUrl: backUrl(church),
    });
    church.set("subscription.mpPreapprovalId", preapproval.id);
    church.set("subscription.mpPreapprovalStatus", preapproval.status);
  }
  church.set("subscription.subscribed", true);
  await church.save();
  if (input.paymentMethod === "pix") await ensureUpcomingInvoice(church);

  await auditLogWithCtx({ action: "CREATE", entity: "Subscription", churchId, userId, metadata: { ...input } });
  return getBillingOverview(churchId);
}

/** Troca de plano: o novo valor vale a partir da próxima cobrança. */
export async function changePlan(churchId: string, userId: string, plan: PlanId): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  assertBillable(church);
  if (church.subscription?.plan === plan) return getBillingOverview(churchId);

  if (church.subscription?.subscribed && church.subscription.paymentMethod === "card" && church.subscription.mpPreapprovalId) {
    await updatePreapprovalAmount(church.subscription.mpPreapprovalId, planPrice(plan));
  }
  church.set("subscription.plan", plan);
  await church.save();

  if (church.subscription?.subscribed && church.subscription.paymentMethod === "pix") {
    // Fatura PIX ainda não paga é refeita com o novo valor.
    const open = await openMonthlyInvoice(church._id);
    if (open) {
      await cancelPayment(platformToken(), open.providerPaymentId).catch(() => undefined);
      open.status = "canceled";
      await open.save();
      await createPixInvoice(church, "monthly", planPrice(plan), open.dueDate, `Athos Management — plano ${planName(plan)} — ${church.name}`);
    }
  }

  await auditLogWithCtx({ action: "UPDATE", entity: "Subscription", churchId, userId, metadata: { plan } });
  return getBillingOverview(churchId);
}

/** Cancela: para as cobranças; o acesso completo vale até o fim do período pago (ou do teste). */
export async function cancelSubscription(churchId: string, userId: string): Promise<BillingOverviewDTO> {
  const church = await loadChurch(churchId);
  assertBillable(church);
  const sub = church.subscription;
  if (sub?.paymentMethod === "card" && sub.mpPreapprovalId) await cancelPreapproval(sub.mpPreapprovalId);
  const open = await BillingInvoice.find({ churchId, kind: "monthly", method: "pix", status: { $in: ["pending", "overdue"] } });
  for (const invoice of open) {
    await cancelPayment(platformToken(), invoice.providerPaymentId).catch(() => undefined);
    invoice.status = "canceled";
    await invoice.save();
  }

  const now = new Date();
  const until = sub?.currentPeriodEnd ?? sub?.trialEndsAt ?? now;
  church.set("subscription.status", "canceled");
  church.set("subscription.subscribed", false);
  church.set("subscription.canceledAt", now);
  church.set("subscription.currentPeriodEnd", until > now ? until : now);
  await church.save();

  await auditLogWithCtx({ action: "UPDATE", entity: "Subscription", churchId, userId, metadata: { event: "canceled" } });
  return getBillingOverview(churchId);
}

// ---------------------------------------------------------------- plataforma

/** Taxa de implantação: fatura PIX única. */
export async function chargeSetupFee(churchId: string, value: number, dueDate: Date): Promise<InvoiceDTO> {
  const church = await loadChurch(churchId);
  const invoice = await createPixInvoice(church, "setup", value, dueDate, `Athos Management — implantação — ${church.name}`);
  return toInvoiceDTO(invoice);
}

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

export function initialSubscription(plan: PlanId, exempt = false) {
  return { plan, status: "trial" as const, exempt, trialEndsAt: new Date(Date.now() + env.TRIAL_DAYS * DAY) };
}

// ---------------------------------------------------------------- notificações e rotina diária

/**
 * Notificações do Mercado Pago das mensalidades (conta da PhantterAI). Nunca confia no corpo: o
 * pagamento/assinatura é sempre consultado na API antes de mudar qualquer status.
 */
export async function processBillingNotification(type: string | undefined, dataId: string | undefined): Promise<{ processed: boolean }> {
  if (!type || !dataId) return { processed: false };
  if (type === "payment") return { processed: await syncPixInvoice(dataId) };
  if (type === "subscription_authorized_payment") return { processed: await syncCardCharge(dataId) };
  if (type === "subscription_preapproval") return { processed: await syncPreapproval(dataId) };
  return { processed: false };
}

/**
 * Rotina diária: gera as faturas PIX que vão vencer, confere as em aberto no Mercado Pago (cobre
 * notificações perdidas), marca inadimplência e envia os avisos por e-mail.
 */
export async function runBillingCycle(now = new Date()): Promise<{ invoices: number; notices: number }> {
  const churches = await Church.find({ "subscription.plan": { $exists: true }, "subscription.exempt": { $ne: true } });
  let invoices = 0;
  for (const church of churches) {
    try {
      const before = await BillingInvoice.countDocuments({ churchId: church._id });
      await ensureUpcomingInvoice(church, now);
      invoices += (await BillingInvoice.countDocuments({ churchId: church._id })) - before;
      const pending = await BillingInvoice.find({ churchId: church._id, method: "pix", status: { $in: ["pending", "overdue"] } }).lean();
      for (const invoice of pending) await syncPixInvoice(invoice.providerPaymentId).catch(() => undefined);
      const fresh = await loadChurch(String(church._id));
      await markOverdue(fresh, now);
    } catch (error) {
      console.error(`[billing] falha no ciclo da igreja ${String(church._id)}: ${error instanceof Error ? error.message : "erro"}`);
    }
  }
  const { sent } = await sendBillingNotices(now);
  return { invoices, notices: sent };
}

/** Avisos por e-mail aos admins quando o estado da assinatura muda. */
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

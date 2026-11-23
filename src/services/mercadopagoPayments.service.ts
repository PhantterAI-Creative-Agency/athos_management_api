import { Types } from "mongoose";
import { Offering } from "../models/Offering.model";
import { PaymentAccount } from "../models/PaymentAccount.model";
import { Church } from "../models/Church.model";
import { User } from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { isPaymentsMockEnabled } from "../helpers/paymentProvider.helper";
import { isMercadoPagoConfigured } from "../helpers/mercadopago.helper";
import { isEncryptionConfigured } from "../helpers/crypto.helper";
import { createPixPayment, getPayment, type MercadoPagoPayment } from "../helpers/mercadopagoPayments.helper";
import { getChurchAccessToken } from "./mercadopagoAccount.service";

/** Validade da cobrança PIX (o Mercado Pago aceita de 30 min a 30 dias). */
export const PIX_EXPIRATION_MINUTES = 60;

export type PaymentMode = "mock" | "mercadopago" | "static_pix" | "unavailable";

/**
 * Como a igreja recebe: Mercado Pago (conta conectada, confirmação automática), PIX estático
 * (só a chave cadastrada, confirmação manual) ou nenhum. "mock" só em testes/desenvolvimento.
 */
export async function resolvePaymentMode(churchId: string): Promise<PaymentMode> {
  if (isPaymentsMockEnabled()) return "mock";
  if (isMercadoPagoConfigured() && isEncryptionConfigured()) {
    const connected = await PaymentAccount.exists({ churchId, status: "connected" });
    if (connected) return "mercadopago";
  }
  const church = await Church.findById(churchId).select("pix").lean();
  return church?.pix ? "static_pix" : "unavailable";
}

const TYPE_LABELS: Record<string, string> = {
  contribution: "Dízimo",
  donation: "Oferta",
  event_registration: "Inscrição",
};

/** Cria a cobrança PIX real na conta da igreja e grava a oferta pendente. */
export async function createMercadoPagoCharge(params: {
  churchId: string;
  userId: string;
  type: "contribution" | "donation" | "event_registration";
  amount: number;
  relatedEventId?: string;
  description?: string;
}) {
  const accessToken = await getChurchAccessToken(params.churchId);
  if (!accessToken) {
    throw new AppError(409, "MERCADOPAGO_NOT_CONNECTED", "A igreja não está com o Mercado Pago conectado");
  }

  const [user, church] = await Promise.all([
    User.findById(params.userId).select("email name").lean(),
    Church.findById(params.churchId).select("name").lean(),
  ]);
  if (!user?.email) {
    throw new AppError(400, "PAYER_EMAIL_REQUIRED", "Cadastre um e-mail no seu perfil para pagar com PIX");
  }

  const offeringId = new Types.ObjectId();
  const expiresAt = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60 * 1000);
  const description = `${params.description ?? TYPE_LABELS[params.type]} - ${church?.name ?? "Igreja"}`;

  let payment: MercadoPagoPayment;
  try {
    payment = await createPixPayment(accessToken, {
      amount: params.amount,
      description,
      externalReference: String(offeringId),
      payerEmail: user.email,
      payerFirstName: user.name?.split(" ")[0],
      expiresAt,
    });
  } catch (error) {
    console.error(`[mercadopago-pix] falha ao criar cobrança: ${error instanceof Error ? error.message : "erro"}`);
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "O Mercado Pago não gerou o PIX agora. Tente de novo em instantes.");
  }

  const data = payment.point_of_interaction?.transaction_data;
  return Offering.create({
    _id: offeringId,
    churchId: params.churchId,
    userId: params.userId,
    type: params.type,
    relatedEventId: params.relatedEventId,
    amount: params.amount,
    currency: "BRL",
    provider: "mercadopago",
    providerPaymentId: String(payment.id),
    status: "pending",
    providerStatus: payment.status,
    pixCopyPaste: data?.qr_code,
    pixQrCodeBase64: data?.qr_code_base64,
    expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : expiresAt,
    statusUpdatedAt: new Date(),
  });
}

type OfferingStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

function mapStatus(payment: MercadoPagoPayment, expiresAt: Date | null | undefined, now: Date): OfferingStatus {
  switch (payment.status) {
    case "approved":
      return "paid";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "rejected":
      return "failed";
    case "cancelled":
      // PIX não pago dentro do prazo é cancelado pelo Mercado Pago.
      return expiresAt && expiresAt <= now ? "expired" : "failed";
    default:
      return "pending"; // pending, in_process, authorized...
  }
}

/** Transições só para a frente: pendente → (pago | falhou | expirado); pago → estornado. */
function canTransition(from: string, to: OfferingStatus): boolean {
  if (from === to) return false;
  if (from === "pending") return to !== "pending";
  if (from === "paid") return to === "refunded";
  return false;
}

export interface SyncResult {
  offeringId: string;
  status: OfferingStatus;
  changed: boolean;
  becamePaid: boolean;
  type: string;
}

/**
 * Consulta o pagamento no Mercado Pago (com o token da igreja) e atualiza a oferta. Nunca usa o
 * conteúdo da notificação como prova. Idempotente: repetir não muda nada.
 */
export async function syncMercadoPagoPayment(paymentId: string, now = new Date()): Promise<SyncResult | null> {
  const offering = await Offering.findOne({ provider: "mercadopago", providerPaymentId: String(paymentId) });
  if (!offering) return null; // pagamento que não é de uma oferta nossa

  const accessToken = await getChurchAccessToken(String(offering.churchId));
  if (!accessToken) {
    throw new AppError(409, "MERCADOPAGO_NOT_CONNECTED", "Conta da igreja desconectada; não foi possível conferir o pagamento");
  }

  const payment = await getPayment(accessToken, String(paymentId));

  if (payment.external_reference && payment.external_reference !== String(offering._id)) {
    console.error(`[mercadopago-pix] referência divergente no pagamento ${paymentId}`);
    return { offeringId: String(offering._id), status: offering.status, changed: false, becamePaid: false, type: offering.type };
  }

  let next = mapStatus(payment, offering.expiresAt, now);
  if (next === "paid" && Math.abs(Number(payment.transaction_amount) - offering.amount) > 0.009) {
    console.error(`[mercadopago-pix] valor divergente no pagamento ${paymentId}; não confirmado`);
    next = "failed";
  }

  const previous = offering.status;
  offering.providerStatus = payment.status;
  if (!canTransition(previous, next)) {
    await offering.save();
    return { offeringId: String(offering._id), status: previous, changed: false, becamePaid: false, type: offering.type };
  }

  offering.status = next;
  offering.statusUpdatedAt = now;
  if (next === "paid") offering.paidAt = payment.date_approved ? new Date(payment.date_approved) : now;
  if (next !== "pending") {
    offering.pixCopyPaste = undefined;
    offering.pixQrCodeBase64 = undefined;
  }
  await offering.save();

  return { offeringId: String(offering._id), status: next, changed: true, becamePaid: next === "paid", type: offering.type };
}

/** Ofertas do Mercado Pago ainda pendentes há mais de `minAgeMinutes` (para conciliação). */
export async function listPendingForReconciliation(now = new Date(), minAgeMinutes = 5): Promise<string[]> {
  const offerings = await Offering.find({
    provider: "mercadopago",
    status: "pending",
    createdAt: { $lt: new Date(now.getTime() - minAgeMinutes * 60 * 1000), $gt: new Date(now.getTime() - 31 * 86_400_000) },
  })
    .select("providerPaymentId")
    .limit(500)
    .lean();
  return offerings.map((o) => o.providerPaymentId);
}

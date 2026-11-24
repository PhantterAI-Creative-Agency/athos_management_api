import crypto from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";

export interface MercadoPagoPayment {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  external_reference?: string | null;
  date_of_expiration?: string | null;
  date_approved?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
}

export class MercadoPagoApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiBase(): string {
  return process.env.MP_API_BASE_URL ?? env.MP_API_BASE_URL;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, accessToken: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const response = await fetch(new URL(path, apiBase()), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    // Nunca inclui o token na mensagem.
    throw new MercadoPagoApiError(response.status, typeof json.message === "string" ? json.message : `HTTP ${response.status}`);
  }
  return json as T;
}

/** Data no formato aceito pelo Mercado Pago (yyyy-MM-ddTHH:mm:ss.SSS-03:00, horário de Brasília). */
export function formatMercadoPagoDate(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().replace("Z", "-03:00");
}

/** URL pública do webhook, derivada do callback do OAuth (mesma API) ou de MP_NOTIFICATION_URL. */
export function notificationUrl(): string | undefined {
  if (process.env.MP_NOTIFICATION_URL) return process.env.MP_NOTIFICATION_URL;
  const redirect = process.env.MP_REDIRECT_URI;
  if (!redirect) return undefined;
  const url = new URL(redirect);
  if (url.protocol !== "https:") return undefined; // o Mercado Pago exige https
  return `${url.origin}${url.pathname.replace(/\/callback$/, "/webhook")}`;
}

export interface CreatePixInput {
  amount: number;
  description: string;
  externalReference: string;
  payerEmail: string;
  payerFirstName?: string;
  /** CPF/CNPJ do pagador (opcional; usado nas mensalidades das igrejas, com o CNPJ do contrato). */
  payerIdentification?: { type: "CPF" | "CNPJ"; number: string };
  expiresAt: Date;
  /** URL de notificação própria (ex.: mensalidades); padrão: webhook das ofertas. */
  notificationUrl?: string;
}

/**
 * Cria uma cobrança PIX **na conta da igreja** (token OAuth dela), sem taxa da plataforma
 * (nenhum application_fee: decisão D3 da URS).
 */
export function createPixPayment(accessToken: string, input: CreatePixInput): Promise<MercadoPagoPayment> {
  if (!(input.amount > 0)) throw new AppError(400, "INVALID_AMOUNT", "Valor inválido");
  return call<MercadoPagoPayment>(
    "POST",
    "/v1/payments",
    accessToken,
    {
      transaction_amount: Math.round(input.amount * 100) / 100,
      description: input.description.slice(0, 120),
      payment_method_id: "pix",
      external_reference: input.externalReference,
      date_of_expiration: formatMercadoPagoDate(input.expiresAt),
      ...((input.notificationUrl ?? notificationUrl()) ? { notification_url: input.notificationUrl ?? notificationUrl() } : {}),
      payer: {
        email: input.payerEmail,
        ...(input.payerFirstName ? { first_name: input.payerFirstName } : {}),
        ...(input.payerIdentification ? { identification: input.payerIdentification } : {}),
      },
    },
    // A própria oferta é a chave: repetir a requisição não cria cobrança duplicada.
    input.externalReference,
  );
}

/** Cancela uma cobrança ainda pendente (ex.: fatura substituída por troca de plano). */
export function cancelPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment> {
  return call<MercadoPagoPayment>("PUT", `/v1/payments/${encodeURIComponent(paymentId)}`, accessToken, { status: "cancelled" });
}

export function getPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment> {
  return call<MercadoPagoPayment>("GET", `/v1/payments/${encodeURIComponent(paymentId)}`, accessToken);
}

/**
 * Valida o cabeçalho x-signature ("ts=...,v1=...") com MP_WEBHOOK_SECRET: HMAC-SHA256 do texto
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". Rejeita notificações com mais de 15 min.
 * O conteúdo da notificação nunca é usado como prova: o pagamento sempre é consultado na API.
 */
export function verifyWebhookSignature(params: {
  signatureHeader?: string;
  requestId?: string;
  dataId?: string;
  secret: string;
  now?: number;
}): boolean {
  if (!params.signatureHeader || !params.dataId) return false;
  const parts = Object.fromEntries(
    params.signatureHeader.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const tsNumber = Number(ts);
  const tsMs = tsNumber > 1e12 ? tsNumber : tsNumber * 1000;
  if (!Number.isFinite(tsMs) || Math.abs((params.now ?? Date.now()) - tsMs) > 15 * 60 * 1000) return false;

  const dataId = /^[a-z0-9]+$/i.test(params.dataId) ? params.dataId.toLowerCase() : params.dataId;
  let manifest = `id:${dataId};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac("sha256", params.secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

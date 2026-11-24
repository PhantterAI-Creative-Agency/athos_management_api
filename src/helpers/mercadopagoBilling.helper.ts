import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";

/**
 * Chamadas à API do Mercado Pago com o token da conta da PhantterAI, usadas só para cobrar as
 * mensalidades das igrejas. As ofertas dos membros usam o token de cada igreja (outro fluxo).
 */

export interface MercadoPagoPreapproval {
  id: string;
  status: string;
  init_point?: string;
  external_reference?: string;
  next_payment_date?: string;
  auto_recurring?: { transaction_amount?: number };
}

export interface MercadoPagoAuthorizedPayment {
  id: number | string;
  preapproval_id: string;
  status: string;
  transaction_amount: number;
  debit_date?: string;
  date_created?: string;
  payment?: { id: number | string; status: string; status_detail?: string };
}

export class MercadoPagoBillingError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function platformToken(): string {
  const token = process.env.MP_PLATFORM_ACCESS_TOKEN;
  if (!token) throw new AppError(503, "BILLING_NOT_CONFIGURED", "Cobrança das mensalidades ainda não configurada na plataforma");
  return token;
}

export function isBillingConfigured(): boolean {
  return !!process.env.MP_PLATFORM_ACCESS_TOKEN;
}

/** URL das notificações das mensalidades (separada da das ofertas), derivada de MP_REDIRECT_URI. */
export function billingNotificationUrl(): string | undefined {
  if (process.env.MP_BILLING_NOTIFICATION_URL) return process.env.MP_BILLING_NOTIFICATION_URL;
  const redirect = process.env.MP_REDIRECT_URI;
  if (!redirect) return undefined;
  const url = new URL(redirect);
  if (url.protocol !== "https:") return undefined;
  return `${url.origin}${url.pathname.replace(/\/payments\/mercadopago\/callback$/, "/billing/mercadopago/webhook")}`;
}

async function call<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
  const response = await fetch(new URL(path, process.env.MP_API_BASE_URL ?? env.MP_API_BASE_URL), {
    method,
    headers: {
      Authorization: `Bearer ${platformToken()}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new MercadoPagoBillingError(response.status, typeof json.message === "string" ? json.message : `HTTP ${response.status}`);
  }
  return json as T;
}

/** Assinatura no cartão (preapproval) sem plano associado; o admin informa o cartão no init_point. */
export function createPreapproval(input: {
  reason: string;
  externalReference: string;
  payerEmail: string;
  amount: number;
  startDate: Date;
  backUrl: string;
}): Promise<MercadoPagoPreapproval> {
  return call<MercadoPagoPreapproval>("POST", "/preapproval", {
    reason: input.reason.slice(0, 250),
    external_reference: input.externalReference,
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    status: "pending",
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      start_date: input.startDate.toISOString(),
      transaction_amount: input.amount,
      currency_id: "BRL",
    },
  });
}

export function getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
  return call<MercadoPagoPreapproval>("GET", `/preapproval/${encodeURIComponent(id)}`);
}

export function updatePreapprovalAmount(id: string, amount: number): Promise<MercadoPagoPreapproval> {
  return call<MercadoPagoPreapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, {
    auto_recurring: { transaction_amount: amount, currency_id: "BRL" },
  });
}

/** Cancela a assinatura no cartão. O Mercado Pago usa "canceled" (com um "l"). */
export function cancelPreapproval(id: string): Promise<MercadoPagoPreapproval> {
  return call<MercadoPagoPreapproval>("PUT", `/preapproval/${encodeURIComponent(id)}`, { status: "canceled" });
}

export function getAuthorizedPayment(id: string): Promise<MercadoPagoAuthorizedPayment> {
  return call<MercadoPagoAuthorizedPayment>("GET", `/authorized_payments/${encodeURIComponent(id)}`);
}

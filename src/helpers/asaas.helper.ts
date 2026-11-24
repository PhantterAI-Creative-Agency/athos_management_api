import { AppError } from "../middlewares/errorHandler";

/**
 * Cliente mínimo da API do Asaas (conta da Athos), usado só para cobrar as mensalidades das
 * igrejas. Autenticação pelo cabeçalho `access_token` com a chave da API.
 */

export interface AsaasPayment {
  id: string;
  customer: string;
  subscription?: string | null;
  value: number;
  status: string;
  dueDate: string;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
}

export class AsaasApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isAsaasConfigured(): boolean {
  return !!process.env.ASAAS_API_KEY;
}

function baseUrl(): string {
  return (process.env.ASAAS_API_URL ?? "https://api-sandbox.asaas.com/v3").replace(/\/+$/, "");
}

async function call<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new AppError(503, "BILLING_NOT_CONFIGURED", "Cobrança da plataforma ainda não configurada");
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      access_token: apiKey,
      Accept: "application/json",
      "User-Agent": "athos-management",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errors = Array.isArray(json.errors) ? (json.errors as { description?: string }[]) : [];
    throw new AsaasApiError(response.status, errors[0]?.description ?? `HTTP ${response.status}`);
  }
  return json as T;
}

const today = () => new Date().toISOString().slice(0, 10);
export const toAsaasDate = (date: Date) => date.toISOString().slice(0, 10);

export function createCustomer(input: { name: string; cpfCnpj: string; email?: string; externalReference: string }) {
  return call<{ id: string }>("POST", "/customers", { ...input, notificationDisabled: false });
}

export function createSubscription(input: {
  customer: string;
  value: number;
  nextDueDate: Date;
  billingType: "UNDEFINED" | "BOLETO" | "PIX";
  description: string;
  externalReference: string;
}) {
  return call<{ id: string; status: string; nextDueDate: string }>("POST", "/subscriptions", {
    customer: input.customer,
    billingType: input.billingType,
    value: input.value,
    nextDueDate: toAsaasDate(input.nextDueDate) < today() ? today() : toAsaasDate(input.nextDueDate),
    cycle: "MONTHLY",
    description: input.description,
    externalReference: input.externalReference,
  });
}

/** Remove a assinatura; o Asaas apaga as cobranças pendentes/vencidas e mantém as pagas. */
export function deleteSubscription(id: string) {
  return call<{ deleted: boolean; id: string }>("DELETE", `/subscriptions/${encodeURIComponent(id)}`);
}

export function listSubscriptionPayments(id: string) {
  return call<{ data: AsaasPayment[] }>("GET", `/subscriptions/${encodeURIComponent(id)}/payments`);
}

export function createPayment(input: {
  customer: string;
  value: number;
  dueDate: Date;
  billingType: "UNDEFINED" | "BOLETO" | "PIX";
  description: string;
  externalReference: string;
}) {
  return call<AsaasPayment>("POST", "/payments", { ...input, dueDate: toAsaasDate(input.dueDate) });
}

export function getPayment(id: string) {
  return call<AsaasPayment>("GET", `/payments/${encodeURIComponent(id)}`);
}

import crypto from "node:crypto";
import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";
import type { PaymentProvider } from "../interfaces/offering.interface";

export interface CheckoutResult {
  providerPaymentId: string;
  clientSecret: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
}

/**
 * Cobranças simuladas só existem em testes automatizados ou com PAYMENTS_MOCK_ENABLED=true
 * (desenvolvimento). Em produção ficam desligadas até a integração real com o Mercado Pago
 * (Sprint 5); até lá, as ofertas usam a chave PIX estática da igreja.
 */
export function isPaymentsMockEnabled(): boolean {
  const flag = process.env.PAYMENTS_MOCK_ENABLED;
  if (flag !== undefined) return flag === "true";
  return env.NODE_ENV === "test";
}

export async function createCheckout(provider: PaymentProvider, amount: number): Promise<CheckoutResult> {
  if (!isPaymentsMockEnabled()) {
    throw new AppError(
      409,
      "ONLINE_PAYMENTS_UNAVAILABLE",
      "Pagamento on-line ainda não está disponível. Use a chave PIX da igreja.",
    );
  }

  void amount;
  const providerPaymentId = `${provider}_mock_${crypto.randomUUID()}`;
  return {
    providerPaymentId,
    clientSecret: `${providerPaymentId}_secret`,
    pixQrCode: `data:image/png;base64,mock_qr_${providerPaymentId}`,
    pixCopyPaste: `00020126_mock_pix_${providerPaymentId}`,
  };
}

import crypto from "node:crypto";
import type { PaymentProvider } from "../interfaces/offering.interface";

export interface CheckoutResult {
  providerPaymentId: string;
  clientSecret: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
}

// Stub: ainda não há credenciais reais de Stripe/Pagar.me/Mercado Pago configuradas em
// `config/env.ts`. Gera um identificador determinístico para manter todo o fluxo (criação →
// checkout → webhook) testável ponta a ponta; troque pela chamada real ao SDK do provedor
// (stripe.paymentIntents.create / Pagar.me / mercadopago.payment.create) quando as
// credenciais existirem.
export async function createCheckout(provider: PaymentProvider, amount: number): Promise<CheckoutResult> {
  void amount;
  const providerPaymentId = `${provider}_mock_${crypto.randomUUID()}`;
  const clientSecret = `${providerPaymentId}_secret`;

  if (provider === "mercadopago") {
    // O Mercado Pago retorna o Pix (QR Code + copia-e-cola) junto da resposta do pagamento
    // (point_of_interaction.transaction_data), sem precisar de uma segunda plataforma dedicada.
    return {
      providerPaymentId,
      clientSecret,
      pixQrCode: `data:image/png;base64,mock_qr_${providerPaymentId}`,
      pixCopyPaste: `00020126_mock_pix_${providerPaymentId}`,
    };
  }

  return { providerPaymentId, clientSecret };
}

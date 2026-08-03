import { z } from "zod";
import { PAYMENT_PROVIDERS } from "../models/Offering.model";

export const createOfferingSchema = z.object({
  type: z.enum(["contribution", "donation"]),
  amount: z.number().positive("O valor deve ser maior que zero"),
  provider: z.enum(PAYMENT_PROVIDERS).default("stripe"),
});

export type CreateOfferingDTO = z.infer<typeof createOfferingSchema>;
export type PaymentProvider = CreateOfferingDTO["provider"];

export const listOfferingsQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  userId: z.string().optional(),
  churchId: z.string().optional(),
});

export type ListOfferingsQueryDTO = z.infer<typeof listOfferingsQuerySchema>;

export const offeringsSummaryQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  userId: z.string().optional(),
  churchId: z.string().optional(),
});

export type OfferingsSummaryQueryDTO = z.infer<typeof offeringsSummaryQuerySchema>;

export const paymentWebhookSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS),
  providerPaymentId: z.string().min(1),
  status: z.enum(["paid", "failed", "refunded"]),
});

export type PaymentWebhookDTO = z.infer<typeof paymentWebhookSchema>;

export interface OfferingDTO {
  id: string;
  churchId: string;
  userId: string;
  type: "event_registration" | "contribution" | "donation";
  relatedEventId?: string;
  amount: number;
  currency: "BRL";
  provider: PaymentProvider;
  providerPaymentId: string;
  status: "pending" | "paid" | "failed" | "refunded";
  createdAt: string;
}

export interface CreateOfferingResultDTO extends OfferingDTO {
  clientSecret: string;
  // Só presentes quando `provider: "mercadopago"` — o Mercado Pago gera Pix nativamente
  // (QR Code + código "copia e cola") junto do checkout, sem precisar de outra plataforma.
  pixQrCode?: string;
  pixCopyPaste?: string;
}

export interface OfferingsSummaryDTO {
  year: number | "all";
  totalPaid: number;
  count: number;
}

import { z } from "zod";
import { PAYMENT_PROVIDERS } from "../models/Offering.model";
import { EVENT_REGISTRATION_STATUSES } from "../models/EventRegistration.model";

export const registerForEventSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS).default("mercadopago"),
});

export type RegisterForEventDTO = z.infer<typeof registerForEventSchema>;

export const updateEventRegistrationSchema = z.object({
  status: z.enum(EVENT_REGISTRATION_STATUSES),
});

export type UpdateEventRegistrationDTO = z.infer<typeof updateEventRegistrationSchema>;

export const listEventRegistrationsQuerySchema = z.object({
  status: z.enum(EVENT_REGISTRATION_STATUSES).optional(),
});

export type ListEventRegistrationsQueryDTO = z.infer<typeof listEventRegistrationsQuerySchema>;

export type EventRegistrationStatus = (typeof EVENT_REGISTRATION_STATUSES)[number];

export interface EventRegistrationDTO {
  id: string;
  churchId: string;
  eventId: string;
  userId: string;
  status: EventRegistrationStatus;
  paymentId?: string;
  createdAt: string;
}

export interface RegisterEventResultDTO extends EventRegistrationDTO {
  clientSecret?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  /**
   * "automatic": confirmação pelo provedor (webhook). "manual": PIX na chave da igreja; a
   * secretaria confirma a inscrição depois de conferir o pagamento.
   */
  paymentConfirmation?: "automatic" | "manual";
  /** Chave PIX da igreja (quando a confirmação é manual), para exibir/copiar. */
  pixKey?: { keyType: string; keyFormatted: string; receiverName: string };
  /** Validade do PIX (cobrança do Mercado Pago). */
  expiresAt?: string;
}

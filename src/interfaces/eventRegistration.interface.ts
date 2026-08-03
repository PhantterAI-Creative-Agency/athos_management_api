import { z } from "zod";
import { PAYMENT_PROVIDERS } from "../models/Offering.model";
import { EVENT_REGISTRATION_STATUSES } from "../models/EventRegistration.model";

export const registerForEventSchema = z.object({
  provider: z.enum(PAYMENT_PROVIDERS).default("stripe"),
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
}

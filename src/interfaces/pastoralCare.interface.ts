import { z } from "zod";

export const createPrayerCareRecipientSchema = z.object({
  userId: z.string().min(1, "userId é obrigatório"),
});

export type CreatePrayerCareRecipientDTO = z.infer<typeof createPrayerCareRecipientSchema>;

export const updatePrayerCareRecipientSchema = z.object({
  active: z.boolean(),
});

export type UpdatePrayerCareRecipientDTO = z.infer<typeof updatePrayerCareRecipientSchema>;

export interface PrayerCareRecipientDTO {
  id: string;
  churchId: string;
  userId: string;
  active: boolean;
  createdAt: string;
}

export interface PastoralCareRequestDTO {
  id: string;
  churchId: string;
  userId?: string;
  guestName?: string;
  guestWhatsapp?: string;
  message: string;
  status: "pending" | "acknowledged";
  notifiedRecipientIds: string[];
  createdAt: string;
}

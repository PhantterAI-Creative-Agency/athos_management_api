import { z } from "zod";

export const checkinTokenQuerySchema = z.object({
  eventId: z.string().optional(),
});

export type CheckinTokenQueryDTO = z.infer<typeof checkinTokenQuerySchema>;

export const registerCheckinSchema = z.object({
  token: z.string().min(1, "Token é obrigatório"),
});

export type RegisterCheckinDTO = z.infer<typeof registerCheckinSchema>;

export const listCheckinQuerySchema = z.object({
  userId: z.string().optional(),
  eventId: z.string().optional(),
});

export type ListCheckinQueryDTO = z.infer<typeof listCheckinQuerySchema>;

export interface CheckinTokenDTO {
  token: string;
  expiresAt: string;
}

export interface CheckinLogDTO {
  id: string;
  churchId: string;
  userId: string;
  eventId?: string;
  checkedInBy: string;
  checkedInAt: string;
  createdAt: string;
}

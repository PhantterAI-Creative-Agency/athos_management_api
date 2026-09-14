import { z } from "zod";

export const createJingleSchema = z.object({
  churchId: z.string().optional(),
  title: z.string().min(1, "Título é obrigatório"),
  url: z.string().min(1, "URL do áudio é obrigatória"),
  active: z.boolean().optional(),
  order: z.number().int().optional(),
});

export type CreateJingleDTO = z.infer<typeof createJingleSchema>;

export const updateJingleSchema = z.object({
  title: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  active: z.boolean().optional(),
  order: z.number().int().optional(),
});

export type UpdateJingleDTO = z.infer<typeof updateJingleSchema>;

export interface JingleDTO {
  id: string;
  churchId: string;
  title: string;
  url: string;
  active: boolean;
  order: number;
  createdAt: string;
}

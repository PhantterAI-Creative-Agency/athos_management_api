import { z } from "zod";

export const BADGE_CRITERIA_TYPES = ["streak", "checkins", "plans_completed", "offerings"] as const;
export type BadgeCriteriaType = (typeof BADGE_CRITERIA_TYPES)[number] | (string & {});

export const createBadgeSchema = z.object({
  key: z.string().min(1, "Chave é obrigatória"),
  name: z.string().min(1, "Nome é obrigatório"),
  iconUrl: z.string().min(1, "Ícone é obrigatório"),
  criteria: z.object({
    type: z.string().min(1, "Tipo de critério é obrigatório"),
    target: z.number().int().positive("Meta deve ser maior que zero"),
  }),
});

export type CreateBadgeDTO = z.infer<typeof createBadgeSchema>;

export const updateBadgeSchema = z.object({
  key: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  iconUrl: z.string().min(1).optional(),
  criteria: z
    .object({
      type: z.string().min(1),
      target: z.number().int().positive(),
    })
    .optional(),
});

export type UpdateBadgeDTO = z.infer<typeof updateBadgeSchema>;

export interface BadgeDTO {
  id: string;
  key: string;
  name: string;
  iconUrl: string;
  criteria: { type: string; target: number };
}

export interface UserBadgeDTO extends BadgeDTO {
  earned: boolean;
  progress: number;
}

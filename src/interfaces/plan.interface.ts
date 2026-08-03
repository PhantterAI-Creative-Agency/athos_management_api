import { z } from "zod";

export const PLAN_SOURCES = ["internal", "partner"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export const PLAN_PROGRESS_STATUSES = ["saved", "in_progress", "completed"] as const;
export type PlanProgressStatus = (typeof PLAN_PROGRESS_STATUSES)[number];

export const createPlanSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  coverUrl: z.string().min(1, "Capa é obrigatória"),
  durationDays: z.number().int().positive("Duração deve ser maior que zero"),
  themes: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional(),
  source: z.enum(PLAN_SOURCES).optional(),
});

export type CreatePlanDTO = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z.object({
  title: z.string().min(1).optional(),
  coverUrl: z.string().min(1).optional(),
  durationDays: z.number().int().positive().optional(),
  themes: z.array(z.string()).optional(),
  rating: z.number().min(0).max(5).optional(),
  source: z.enum(PLAN_SOURCES).optional(),
});

export type UpdatePlanDTO = z.infer<typeof updatePlanSchema>;

export const listPlansQuerySchema = z.object({
  tab: z.enum(["mine", "find", "saved", "completed"]).optional(),
});

export type ListPlansQueryDTO = z.infer<typeof listPlansQuerySchema>;

export const upsertPlanProgressSchema = z.object({
  status: z.enum(PLAN_PROGRESS_STATUSES).optional(),
  currentDay: z.number().int().min(0).optional(),
});

export type UpsertPlanProgressDTO = z.infer<typeof upsertPlanProgressSchema>;

export interface PlanDTO {
  id: string;
  title: string;
  coverUrl: string;
  durationDays: number;
  themes: string[];
  rating: number;
  source: PlanSource;
  createdAt: string;
}

export interface PlanProgressDTO {
  id: string;
  userId: string;
  planId: string;
  status: PlanProgressStatus;
  currentDay: number;
  totalDays: number;
  completedAt?: string;
  friendsAlsoCompletedIds: string[];
  updatedAt: string;
}

export interface PlanDetailDTO extends PlanDTO {
  progress: PlanProgressDTO | null;
}

export interface PlanListItemDTO extends PlanDTO {
  progress: PlanProgressDTO;
}

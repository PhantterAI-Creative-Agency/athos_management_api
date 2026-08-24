import { z } from "zod";

export const createMinistrySchema = z.object({
  churchId: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  iconUrl: z.string().max(2_000_000, "Imagem muito grande").optional(),
  contractRequired: z.boolean().optional(),
  leaderId: z.string().nullable().optional(),
});

export type CreateMinistryDTO = z.infer<typeof createMinistrySchema>;

export const updateMinistrySchema = z.object({
  name: z.string().min(1).optional(),
  iconUrl: z.string().max(2_000_000, "Imagem muito grande").optional(),
  contractRequired: z.boolean().optional(),
  leaderId: z.string().nullable().optional(),
});

export type UpdateMinistryDTO = z.infer<typeof updateMinistrySchema>;

export const listMinistriesQuerySchema = z.object({
  highlightUserId: z.string().optional(),
});

export type ListMinistriesQueryDTO = z.infer<typeof listMinistriesQuerySchema>;

export const addVolunteerSchema = z.object({
  userId: z.string().optional(),
  role: z.string().optional(),
});

export type AddVolunteerDTO = z.infer<typeof addVolunteerSchema>;

export const serviceFunctionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Nome da função é obrigatório"),
});

export const replaceServiceFunctionsSchema = z.object({
  functions: z.array(serviceFunctionItemSchema).min(1, "Informe ao menos uma função"),
});

export type ReplaceServiceFunctionsDTO = z.infer<typeof replaceServiceFunctionsSchema>;

export interface ServiceFunctionDTO {
  id: string;
  name: string;
  order: number;
}

export interface MinistryDTO {
  id: string;
  churchId: string;
  name: string;
  iconUrl?: string;
  contractRequired: boolean;
  participantsCount: number;
  isVolunteer: boolean;
  leaderId?: string;
  leaderName?: string;
  createdAt: string;
}

export interface MinistryVolunteerDTO {
  id: string;
  ministryId: string;
  userId: string;
  role?: string;
  contractSigned: boolean;
  active: boolean;
  joinedAt: string;
}

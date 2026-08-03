import { z } from "zod";

export const createMinistrySchema = z.object({
  churchId: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  iconUrl: z.string().optional(),
  contractRequired: z.boolean().optional(),
});

export type CreateMinistryDTO = z.infer<typeof createMinistrySchema>;

export const updateMinistrySchema = z.object({
  name: z.string().min(1).optional(),
  iconUrl: z.string().optional(),
  contractRequired: z.boolean().optional(),
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

export interface MinistryDTO {
  id: string;
  churchId: string;
  name: string;
  iconUrl?: string;
  contractRequired: boolean;
  participantsCount: number;
  isVolunteer: boolean;
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

import { z } from "zod";

export const searchChurchesQuerySchema = z.object({
  q: z.string().min(1),
});

export type SearchChurchesQueryDTO = z.infer<typeof searchChurchesQuerySchema>;

export const registerChurchSchema = z.object({
  name: z.string().min(1),
  logoUrl: z.string().min(1),
  address: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug deve conter apenas letras minúsculas, números e hífens")
    .optional(),
});

export type RegisterChurchDTO = z.infer<typeof registerChurchSchema>;

export interface ChurchSearchResultDTO {
  name: string;
  logoUrl: string;
  slug: string;
  address?: string;
}

const homeContentSchema = z.object({
  intro: z.string().optional(),
  mission: z.string().optional(),
  vision: z.string().optional(),
  values: z.string().optional(),
  bannerEventId: z.string().optional(),
});

const contactSchema = z.object({
  email: z.string().optional(),
  whatsapp: z.string().optional(),
});

export const updateChurchSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  settings: z
    .object({
      primaryColor: z.string().min(1).optional(),
      growthGroupName: z.string().min(1).optional(),
      growthGroupAcronym: z.string().min(1).optional(),
    })
    .optional(),
  homeContent: homeContentSchema.optional(),
  contact: contactSchema.optional(),
});

export type UpdateChurchDTO = z.infer<typeof updateChurchSchema>;

export interface ChurchDTO {
  id: string;
  name: string;
  logoUrl: string;
  address?: string;
  slug: string;
  settings: { primaryColor: string; growthGroupName: string; growthGroupAcronym: string };
  homeContent?: {
    intro?: string;
    mission?: string;
    vision?: string;
    values?: string;
    bannerEventId?: string;
  };
  contact?: {
    email?: string;
    whatsapp?: string;
  };
  createdAt: string;
}

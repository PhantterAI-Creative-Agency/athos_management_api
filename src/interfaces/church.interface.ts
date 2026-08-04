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

const socialLinksSchema = z.object({
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  youtube: z.string().optional(),
});

const serviceScheduleItemSchema = z.object({
  day: z.string().min(1),
  time: z.string().min(1),
  theme: z.string().min(1),
});

export const updateChurchSchema = z.object({
  name: z.string().min(1).optional(),
  logoUrl: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  about: z.string().min(1).optional(),
  settings: z
    .object({
      primaryColor: z.string().min(1).optional(),
      growthGroupName: z.string().min(1).optional(),
      growthGroupAcronym: z.string().min(1).optional(),
    })
    .optional(),
  homeContent: homeContentSchema.optional(),
  contact: contactSchema.optional(),
  socialLinks: socialLinksSchema.optional(),
  serviceSchedule: z.array(serviceScheduleItemSchema).optional(),
});

export type UpdateChurchDTO = z.infer<typeof updateChurchSchema>;

export interface ChurchDTO {
  id: string;
  name: string;
  logoUrl: string;
  address?: string;
  phone?: string;
  about?: string;
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
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
  serviceSchedule?: { day: string; time: string; theme: string }[];
  createdAt: string;
}

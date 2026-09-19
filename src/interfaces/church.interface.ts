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

const socialLinkSchema = z.object({
  platform: z.string().min(1),
  url: z.string().min(1),
});

const contactSchema = z.object({
  email: z.string().optional(),
  whatsapp: z.string().optional(),
  phone: z.string().optional(),
  socialLinks: z.array(socialLinkSchema).optional(),
});

const addressDetailsSchema = z.object({
  cep: z.string().min(1),
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
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
  pastors: z.string().min(1).optional(),
  address: z.string().optional(),
  addressDetails: addressDetailsSchema.optional(),
  phone: z.string().min(1).optional(),
  about: z.string().min(1).optional(),
  settings: z
    .object({
      primaryColor: z.string().min(1).optional(),
      growthGroupName: z.string().min(1).optional(),
      growthGroupAcronym: z.string().min(1).optional(),
      adsEnabled: z.boolean().optional(),
      disabledAdPlacements: z.array(z.string()).optional(),
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
  pastors?: string;
  addressDetails?: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  phone?: string;
  about?: string;
  slug: string;
  settings: {
    primaryColor: string;
    growthGroupName: string;
    growthGroupAcronym: string;
    adsEnabled: boolean;
    disabledAdPlacements: string[];
  };
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
    phone?: string;
    socialLinks?: { platform: string; url: string }[];
  };
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    youtube?: string;
  };
  serviceSchedule?: { day: string; time: string; theme: string }[];
  createdAt: string;
}

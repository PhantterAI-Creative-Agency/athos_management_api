import { z } from "zod";

const adFormatSchema = z.enum(["card", "slide"]);

export const createAdSchema = z.object({
  format: adFormatSchema,
  placement: z.string().min(1, "Posição é obrigatória"),
  title: z.string().min(1, "Título é obrigatório"),
  imageUrl: z.string().min(1, "Imagem é obrigatória").max(2_000_000, "Imagem muito grande"),
  linkUrl: z.string().optional(),
  active: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  order: z.number().optional(),
});

export type CreateAdDTO = z.infer<typeof createAdSchema>;

export const updateAdSchema = z.object({
  format: adFormatSchema.optional(),
  placement: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  imageUrl: z.string().min(1).max(2_000_000, "Imagem muito grande").optional(),
  linkUrl: z.string().optional(),
  active: z.boolean().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  order: z.number().optional(),
});

export type UpdateAdDTO = z.infer<typeof updateAdSchema>;

export const listAdsPublicQuerySchema = z.object({
  placement: z.string().min(1, "Posição é obrigatória"),
  format: adFormatSchema,
});

export type ListAdsPublicQueryDTO = z.infer<typeof listAdsPublicQuerySchema>;

export interface AdDTO {
  id: string;
  churchId: string;
  format: "card" | "slide";
  placement: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  active: boolean;
  startDate?: string;
  endDate?: string;
  order: number;
  clicks: number;
  impressions: number;
  createdAt: string;
}

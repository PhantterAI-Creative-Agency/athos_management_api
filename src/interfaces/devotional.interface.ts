import { z } from "zod";

export const createDevotionalSchema = z.object({
  churchId: z.string().optional(),
  title: z.string().min(1, "Título é obrigatório"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  publishedAt: z.string().datetime().optional(),
  imageUrl: z.string().max(2_000_000, "Imagem muito grande").optional(),
});

export type CreateDevotionalDTO = z.infer<typeof createDevotionalSchema>;

export const updateDevotionalSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  publishedAt: z.string().datetime().optional(),
  imageUrl: z.string().max(2_000_000, "Imagem muito grande").optional(),
});

export type UpdateDevotionalDTO = z.infer<typeof updateDevotionalSchema>;

export interface DevotionalDTO {
  id: string;
  churchId: string;
  title: string;
  content: string;
  publishedAt: string;
  createdAt: string;
  imageUrl?: string;
}

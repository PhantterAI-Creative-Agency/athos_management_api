import { z } from "zod";

const mediaTypeSchema = z.enum(["video", "photo"]);

export const createMediaSchema = z.object({
  churchId: z.string().optional(),
  type: mediaTypeSchema,
  category: z.string().min(1, "Categoria é obrigatória"),
  title: z.string().min(1, "Título é obrigatório"),
  youtubeId: z.string().optional(),
  url: z.string().optional(),
});

export type CreateMediaDTO = z.infer<typeof createMediaSchema>;

export const updateMediaSchema = z.object({
  type: mediaTypeSchema.optional(),
  category: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  youtubeId: z.string().optional(),
  url: z.string().optional(),
});

export type UpdateMediaDTO = z.infer<typeof updateMediaSchema>;

export interface MediaDTO {
  id: string;
  churchId: string;
  type: "video" | "photo";
  category: string;
  title: string;
  youtubeId?: string;
  url?: string;
  source: "manual" | "youtube_sync";
  createdAt: string;
}

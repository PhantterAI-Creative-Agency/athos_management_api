import { z } from "zod";

export const createHighlightSchema = z
  .object({
    book: z.string().min(1, "Livro é obrigatório"),
    chapter: z.number().int().positive(),
    verseStart: z.number().int().positive(),
    verseEnd: z.number().int().positive().optional(),
    version: z.string().min(1, "Versão é obrigatória"),
    text: z.string().min(1, "Texto é obrigatório"),
    visibility: z.enum(["public", "friends"]).default("public"),
  })
  .refine((data) => data.verseEnd === undefined || data.verseEnd >= data.verseStart, {
    message: "verseEnd deve ser maior ou igual a verseStart",
    path: ["verseEnd"],
  });

export type CreateHighlightDTO = z.infer<typeof createHighlightSchema>;

export const listHighlightsQuerySchema = z.object({
  userId: z.string().optional(),
  visibility: z.enum(["public", "friends"]).optional(),
});

export type ListHighlightsQueryDTO = z.infer<typeof listHighlightsQuerySchema>;

export interface HighlightDTO {
  id: string;
  userId: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
  version: string;
  text: string;
  likesCount: number;
  visibility: "public" | "friends";
  liked: boolean;
  createdAt: string;
}

export interface ToggleHighlightLikeDTO {
  liked: boolean;
  likesCount: number;
}

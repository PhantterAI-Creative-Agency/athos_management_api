import { z } from "zod";

export const bibleChapterParamsSchema = z.object({
  book: z.string().min(1, "Livro é obrigatório"),
  chapter: z.coerce.number().int().positive("Capítulo deve ser um número positivo"),
});

export type BibleChapterParamsDTO = z.infer<typeof bibleChapterParamsSchema>;

export const bibleChapterQuerySchema = z.object({
  version: z.string().min(1).default("nvi"),
});

export type BibleChapterQueryDTO = z.infer<typeof bibleChapterQuerySchema>;

export interface BibleVerseDTO {
  number: number;
  text: string;
}

export interface BibleChapterDTO {
  book: {
    abbrev: string;
    name: string;
  };
  version: string;
  chapter: number;
  verses: BibleVerseDTO[];
}

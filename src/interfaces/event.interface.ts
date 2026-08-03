import { z } from "zod";

export const listEventsQuerySchema = z.object({
  upcoming: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export type ListEventsQueryDTO = z.infer<typeof listEventsQuerySchema>;

export const createEventSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  imageUrl: z.string().min(1, "Imagem é obrigatória").max(2_000_000, "Imagem muito grande"),
  featuredImageUrl: z.string().max(2_000_000, "Imagem muito grande").optional(),
  date: z.coerce.date(),
  location: z.string().optional(),
  price: z.number().optional(),
  featured: z.boolean().optional(),
});

export type CreateEventDTO = z.infer<typeof createEventSchema>;

export const updateEventSchema = z.object({
  title: z.string().min(1).optional(),
  imageUrl: z.string().min(1).max(2_000_000, "Imagem muito grande").optional(),
  featuredImageUrl: z.string().max(2_000_000, "Imagem muito grande").optional(),
  date: z.coerce.date().optional(),
  location: z.string().optional(),
  price: z.number().optional(),
  featured: z.boolean().optional(),
});

export type UpdateEventDTO = z.infer<typeof updateEventSchema>;

export interface EventDTO {
  id: string;
  title: string;
  imageUrl: string;
  featuredImageUrl?: string;
  date: string;
  location?: string;
  price?: number;
  featured: boolean;
}

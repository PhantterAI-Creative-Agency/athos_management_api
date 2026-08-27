import { z } from "zod";

export const createDataDeletionRequestSchema = z.object({
  name: z
    .string({ error: "Nome é obrigatório" })
    .trim()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(120, "Nome deve ter no máximo 120 caracteres"),
  email: z
    .string({ error: "Email é obrigatório" })
    .trim()
    .min(1, "Email é obrigatório")
    .max(254, "Email deve ter no máximo 254 caracteres")
    .email("Email inválido"),
  reason: z
    .string()
    .trim()
    .max(2000, "Motivo deve ter no máximo 2000 caracteres")
    .optional(),
});

export type CreateDataDeletionRequestDTO = z.infer<typeof createDataDeletionRequestSchema>;

export interface DataDeletionRequestDTO {
  id: string;
  name: string;
  email: string;
  reason?: string;
  status: "pending" | "completed";
  createdAt: string;
}

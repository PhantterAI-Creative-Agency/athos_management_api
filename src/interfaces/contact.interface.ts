import { z } from "zod";

export const createContactMessageSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(1, "Telefone/Whatsapp é obrigatório"),
  subject: z.string().min(1, "Assunto é obrigatório"),
  message: z.string().min(1, "Mensagem é obrigatória"),
});

export type CreateContactMessageDTO = z.infer<typeof createContactMessageSchema>;

export interface ContactMessageDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  createdAt: string;
}

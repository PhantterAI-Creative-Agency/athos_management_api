import { z } from "zod";

const NAME_REGEX = /^[\p{L}\s'-]+$/u;
const PHONE_REGEX = /^\+?\d{10,15}$/;

export const createContactMessageSchema = z.object({
  name: z
    .string({ error: "Nome é obrigatório" })
    .trim()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(120, "Nome deve ter no máximo 120 caracteres")
    .regex(NAME_REGEX, "Nome deve conter apenas letras e espaços"),
  email: z
    .string({ error: "Email é obrigatório" })
    .trim()
    .min(1, "Email é obrigatório")
    .max(254, "Email deve ter no máximo 254 caracteres")
    .email("Email inválido"),
  phone: z
    .string({ error: "Telefone/Whatsapp é obrigatório" })
    .trim()
    .min(1, "Telefone/Whatsapp é obrigatório")
    .transform((value) => value.replace(/[\s()-]/g, ""))
    .refine((value) => PHONE_REGEX.test(value), "Telefone/Whatsapp inválido"),
  subject: z
    .string({ error: "Assunto é obrigatório" })
    .trim()
    .min(3, "Assunto deve ter no mínimo 3 caracteres")
    .max(150, "Assunto deve ter no máximo 150 caracteres"),
  message: z
    .string({ error: "Mensagem é obrigatória" })
    .trim()
    .min(10, "Mensagem deve ter no mínimo 10 caracteres")
    .max(2000, "Mensagem deve ter no máximo 2000 caracteres"),
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

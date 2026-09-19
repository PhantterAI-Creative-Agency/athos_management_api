import { z } from "zod";
import type { Role } from "../helpers/jwt.helper";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export type LoginDTO = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken é obrigatório"),
});

export type RefreshDTO = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
});

export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Código deve ter 6 dígitos"),
  password: z
    .string()
    .min(8, "Senha deve ter ao menos 8 caracteres")
    .max(72, "Senha deve ter no máximo 72 caracteres"),
});

export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  password: resetPasswordSchema.shape.password,
});

export type ChangePasswordDTO = z.infer<typeof changePasswordSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Deve ter no máximo ${max} caracteres`)
    .optional()
    .transform((value) => value || undefined);

const addressSchema = z
  .object({
    cep: z
      .string()
      .trim()
      .transform((value) => value.replace(/\D/g, ""))
      .refine((value) => value === "" || value.length === 8, "CEP inválido")
      .optional()
      .transform((value) => value || undefined),
    street: optionalText(200),
    neighborhood: optionalText(120),
    city: optionalText(120),
    state: optionalText(2),
    number: optionalText(20),
    complement: optionalText(120),
  })
  .refine((address) => !address.cep || !!address.number, {
    message: "Número é obrigatório quando o CEP é informado",
    path: ["number"],
  });

export const registerSchema = z.object({
  churchSlug: z.string().trim().min(1, "churchSlug é obrigatório"),
  name: z
    .string({ error: "Nome é obrigatório" })
    .trim()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(120, "Nome deve ter no máximo 120 caracteres"),
  email: z
    .string({ error: "E-mail é obrigatório" })
    .trim()
    .max(254, "E-mail deve ter no máximo 254 caracteres")
    .email("E-mail inválido"),
  password: z
    .string({ error: "Senha é obrigatória" })
    .min(8, "Senha deve ter ao menos 8 caracteres")
    .max(72, "Senha deve ter no máximo 72 caracteres"),
  isChurchMember: z.boolean({ error: "Informe se você é membro da Princípios de Vida" }),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._]{3,30}$/, "Usuário deve ter de 3 a 30 caracteres (letras, números, ponto e _)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  address: addressSchema.optional(),
});

export type RegisterDTO = z.infer<typeof registerSchema>;

export interface AuthTokensDTO {
  accessToken: string;
  refreshToken: string;
}

export interface AuthenticatedUserDTO {
  id: string;
  churchId: string;
  name: string;
  email: string;
  roles: Role[];
  leaderMinistryIds: string[];
}

export interface LoginResultDTO extends AuthTokensDTO {
  user: AuthenticatedUserDTO;
}

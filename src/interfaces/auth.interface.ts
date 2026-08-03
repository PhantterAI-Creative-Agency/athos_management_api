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
}

export interface LoginResultDTO extends AuthTokensDTO {
  user: AuthenticatedUserDTO;
}

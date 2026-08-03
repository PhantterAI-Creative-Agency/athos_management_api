import jwt from "jsonwebtoken";
import { env } from "../config/env";

// "Cargos" (deacon..seniorPastor) são independentes de liderança por ministério/GC
// (MinistryVolunteer.role, GrowthGroup.leaderId) — um usuário pode ter um cargo acima
// do líder de um ministério e ainda assim servir nele sob esse líder.
export const ROLES = [
  "visitor",
  "member",
  "volunteer",
  "groupLeader",
  "ministryLeader",
  "deacon",
  "elder",
  "pastor",
  "seniorPastor",
  "admin",
  "devAdmin",
] as const;

export type Role = (typeof ROLES)[number];

export interface AuthTokenPayload {
  sub: string;
  churchId: string;
  roles: Role[];
}

export function signAccessToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthTokenPayload & jwt.JwtPayload;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthTokenPayload & jwt.JwtPayload;
}

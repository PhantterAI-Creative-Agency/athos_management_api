import jwt from "jsonwebtoken";
import crypto from "crypto";
import { env } from "../config/env";

const CHECKIN_TOKEN_TTL_SECONDS = 120;

export interface CheckinTokenPayload {
  sub: string;
  churchId: string;
  eventId?: string;
  jti: string;
  typ: "checkin";
}

export function signCheckinToken(
  userId: string,
  churchId: string,
  eventId?: string,
): { token: string; jti: string; expiresAt: string } {
  const jti = crypto.randomUUID();
  const payload: CheckinTokenPayload = { sub: userId, churchId, eventId, jti, typ: "checkin" };

  const token = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: CHECKIN_TOKEN_TTL_SECONDS });
  const expiresAt = new Date(Date.now() + CHECKIN_TOKEN_TTL_SECONDS * 1000).toISOString();

  return { token, jti, expiresAt };
}

export function verifyCheckinToken(token: string): CheckinTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as CheckinTokenPayload & jwt.JwtPayload;

  if (payload.typ !== "checkin") {
    throw new Error("Token não é um token de check-in");
  }

  return payload;
}

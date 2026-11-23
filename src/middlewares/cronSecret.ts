import type { NextFunction, Request, Response } from "express";
import { sendError } from "../helpers/response.helper";
import { safeEqual } from "../helpers/crypto.helper";

/** Rotas internas de cron: exigem Authorization: Bearer <CRON_SECRET>. Sem a variável, 404. */
export function requireCronSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    sendError(res, 404, "NOT_FOUND", `Rota ${req.method} ${req.originalUrl} não encontrada`);
    return;
  }
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, secret)) {
    sendError(res, 401, "UNAUTHORIZED", "Cron não autorizado");
    return;
  }
  next();
}

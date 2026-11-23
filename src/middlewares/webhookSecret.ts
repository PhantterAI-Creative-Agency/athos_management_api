import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { sendError } from "../helpers/response.helper";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Protege o webhook de pagamentos enquanto a validação de assinatura do Mercado Pago (Sprint 5)
 * não existe: sem PAYMENT_WEBHOOK_SECRET configurado o webhook fica desligado (404); com ele,
 * exige o mesmo valor no cabeçalho X-Webhook-Secret.
 */
export function requireWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  // Lido a cada requisição (o .env já foi carregado em process.env por config/env.ts).
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    sendError(res, 404, "NOT_FOUND", `Rota ${req.method} ${req.originalUrl} não encontrada`);
    return;
  }

  const received = req.headers["x-webhook-secret"];
  if (typeof received !== "string" || !safeEqual(received, secret)) {
    sendError(res, 401, "INVALID_WEBHOOK_SECRET", "Webhook não autorizado");
    return;
  }

  next();
}

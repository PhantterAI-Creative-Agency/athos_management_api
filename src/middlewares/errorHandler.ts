import type { NextFunction, Request, Response } from "express";
import { sendError } from "../helpers/response.helper";

export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(req: Request, res: Response): Response {
  return sendError(res, 404, "NOT_FOUND", `Rota ${req.method} ${req.originalUrl} não encontrada`);
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): Response {
  const errorContext = {
    requestId: req.requestId,
    userId: req.user?.sub,
    churchId: req.user?.churchId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
  };

  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error("[ERROR]", { ...errorContext, code: err.code, message: err.message });
    }
    return sendError(res, err.status, err.code, err.message);
  }

  const message = err instanceof Error ? err.message : "Erro interno inesperado";
  console.error("[UNEXPECTED_ERROR]", { ...errorContext, error: err instanceof Error ? err.stack : String(err) });
  return sendError(res, 500, "INTERNAL_ERROR", message);
}

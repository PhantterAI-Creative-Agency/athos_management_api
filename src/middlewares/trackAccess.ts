import type { NextFunction, Request, Response } from "express";
import { AccessLog } from "../models/AccessLog.model";
import { getChurchBySlug } from "../services/churches.service";

function persist(input: {
  churchId: string;
  authenticated: boolean;
  userId?: string;
  ministryId?: string;
  path: string;
}): void {
  AccessLog.create(input).catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[trackAccess] Failed to persist access log: ${msg}`);
  });
}

/** Registra o acesso de um visitante não autenticado a uma rota pública `/public/churches/:slug/...`. */
export function trackPublicAccess(req: Request, _res: Response, next: NextFunction): void {
  next();

  const slug = req.params.slug;
  if (!slug) return;

  getChurchBySlug(String(slug))
    .then((church) => {
      persist({ churchId: church.id, authenticated: false, path: req.originalUrl });
    })
    .catch(() => {
      // Slug inválido: nada a registrar.
    });
}

/**
 * Registra o acesso de um usuário autenticado a uma rota de visualização.
 * Quando `ministryParam` é informado, associa o acesso ao ministério do parâmetro de rota.
 */
export function trackAuthenticatedAccess(ministryParam?: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    next();

    if (!req.user) return;

    persist({
      churchId: req.user.churchId,
      authenticated: true,
      userId: req.user.sub,
      ministryId: ministryParam ? String(req.params[ministryParam]) : undefined,
      path: req.originalUrl,
    });
  };
}

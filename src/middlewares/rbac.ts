import type { NextFunction, Request, Response } from "express";
import type { Role } from "../helpers/jwt.helper";
import { sendError } from "../helpers/response.helper";
import { isFamilyManager } from "../helpers/family.helper";

export function withRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Usuário não autenticado");
      return;
    }

    const hasAllowedRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasAllowedRole) {
      sendError(res, 403, "FORBIDDEN", "Usuário não possui permissão para este recurso");
      return;
    }

    next();
  };
}

/** Allows the resource owner, an allowed role, or a family member managing the target (parent or parent's spouse). */
export function withSelfFamilyOrRole(allowedRoles: Role[], paramName = "id") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Usuário não autenticado");
      return;
    }

    const targetId = String(req.params[paramName] ?? "");
    const isSelf = req.user.sub === targetId;
    const hasAllowedRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (isSelf || hasAllowedRole) {
      next();
      return;
    }

    const isFamily = await isFamilyManager(req.user.sub, targetId);

    if (!isFamily) {
      sendError(res, 403, "FORBIDDEN", "Usuário não possui permissão para este recurso");
      return;
    }

    next();
  };
}

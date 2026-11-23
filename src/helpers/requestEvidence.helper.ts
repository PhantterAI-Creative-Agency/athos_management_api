import type { Request } from "express";
import type { RequestEvidence } from "../interfaces/legal.interface";

/** Dados da requisição guardados como evidência de aceite (IP, proxy, navegador). */
export function getRequestEvidence(req: Request): RequestEvidence {
  const forwarded = req.headers["x-forwarded-for"];
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? undefined,
    forwardedFor: Array.isArray(forwarded) ? forwarded.join(", ") : forwarded,
    userAgent: req.headers["user-agent"],
  };
}

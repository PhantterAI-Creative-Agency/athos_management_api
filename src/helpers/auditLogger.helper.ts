import type { Request } from "express";
import { AuditLog } from "../models/AuditLog.model";
import type { AuditAction, CreateAuditLogInput } from "../interfaces/auditLog.interface";

function extractRequestContext(req: Request): {
  userId?: string;
  userEmail?: string;
  churchId?: string;
  ip?: string;
  userAgent?: string;
} {
  return {
    userId: req.user?.sub,
    churchId: req.user?.churchId,
    ip: req.ip ?? req.socket.remoteAddress ?? undefined,
    userAgent: req.headers["user-agent"] ?? "unknown",
  };
}

export async function auditLog(
  action: AuditAction,
  entity: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  req?: Request,
): Promise<void> {
  try {
    const input: CreateAuditLogInput = {
      action,
      entity,
      entityId,
      metadata,
      ...(req ? extractRequestContext(req) : {}),
    };

    await AuditLog.create(input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[auditLog] Failed to persist audit entry: ${msg}`);
  }
}

export async function auditLogWithCtx(input: CreateAuditLogInput): Promise<void> {
  try {
    await AuditLog.create(input);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[auditLog] Failed to persist audit entry: ${msg}`);
  }
}

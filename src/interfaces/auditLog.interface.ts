export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "LOGIN",
  "LOGOUT",
  "REGISTER",
  "ADD_MEMBER",
  "REMOVE_MEMBER",
  "LIKE",
  "CHECKIN",
  "OTHER",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface CreateAuditLogInput {
  action: AuditAction;
  entity: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  churchId?: string;
  ministryId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

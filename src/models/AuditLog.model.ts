import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { AUDIT_ACTIONS } from "../interfaces/auditLog.interface";

const auditLogSchema = new Schema(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },
    entity: { type: String, required: true },
    entityId: { type: String },
    userId: { type: String, index: true },
    userEmail: { type: String },
    churchId: { type: String, index: true },
    ministryId: { type: String },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ churchId: 1, createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema> & { _id: Types.ObjectId };

export const AuditLog = model("AuditLog", auditLogSchema);

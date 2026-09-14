import { Schema, model, Types, type InferSchemaType } from "mongoose";

const accessLogSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    authenticated: { type: Boolean, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    ministryId: { type: Schema.Types.ObjectId, ref: "Ministry" },
    path: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

accessLogSchema.index({ churchId: 1, createdAt: -1 });
accessLogSchema.index({ churchId: 1, ministryId: 1 });

export type AccessLogDocument = InferSchemaType<typeof accessLogSchema> & { _id: Types.ObjectId };

export const AccessLog = model("AccessLog", accessLogSchema);

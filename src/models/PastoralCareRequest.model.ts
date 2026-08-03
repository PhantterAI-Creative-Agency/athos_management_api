import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const PASTORAL_CARE_REQUEST_STATUSES = ["pending", "acknowledged"] as const;

const pastoralCareRequestSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    guestName: { type: String },
    guestWhatsapp: { type: String },
    message: { type: String, required: true },
    status: { type: String, enum: PASTORAL_CARE_REQUEST_STATUSES, default: "pending" },
    notifiedRecipientIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

pastoralCareRequestSchema.index({ churchId: 1, createdAt: -1 });

export type PastoralCareRequestDocument = InferSchemaType<typeof pastoralCareRequestSchema> & {
  _id: Types.ObjectId;
};

export const PastoralCareRequest = model("PastoralCareRequest", pastoralCareRequestSchema);

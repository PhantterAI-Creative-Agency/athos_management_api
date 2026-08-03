import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const OFFERING_TYPES = ["event_registration", "contribution", "donation"] as const;
export const OFFERING_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export const PAYMENT_PROVIDERS = ["stripe", "pagarme", "mercadopago"] as const;

const offeringSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: OFFERING_TYPES, required: true },
    relatedEventId: { type: Schema.Types.ObjectId, ref: "Event" },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, enum: ["BRL"], default: "BRL" },
    provider: { type: String, enum: PAYMENT_PROVIDERS, required: true },
    providerPaymentId: { type: String, required: true, unique: true },
    status: { type: String, enum: OFFERING_STATUSES, default: "pending" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

offeringSchema.index({ userId: 1, createdAt: -1 });

export type OfferingDocument = InferSchemaType<typeof offeringSchema> & { _id: Types.ObjectId };

export const Offering = model("Offering", offeringSchema);

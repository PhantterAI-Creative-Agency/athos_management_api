import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const EVENT_REGISTRATION_STATUSES = ["registered", "attending", "attended", "cancelled"] as const;

const eventRegistrationSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: EVENT_REGISTRATION_STATUSES, default: "registered" },
    paymentId: { type: Schema.Types.ObjectId, ref: "Offering" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

eventRegistrationSchema.index({ userId: 1, createdAt: -1 });

export type EventRegistrationDocument = InferSchemaType<typeof eventRegistrationSchema> & { _id: Types.ObjectId };

export const EventRegistration = model("EventRegistration", eventRegistrationSchema);

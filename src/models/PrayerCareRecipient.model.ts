import { Schema, model, Types, type InferSchemaType } from "mongoose";

const prayerCareRecipientSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

prayerCareRecipientSchema.index({ churchId: 1, userId: 1 }, { unique: true });

export type PrayerCareRecipientDocument = InferSchemaType<typeof prayerCareRecipientSchema> & {
  _id: Types.ObjectId;
};

export const PrayerCareRecipient = model("PrayerCareRecipient", prayerCareRecipientSchema);

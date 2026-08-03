import { Schema, model, Types, type InferSchemaType } from "mongoose";

const ministryVolunteerSchema = new Schema(
  {
    ministryId: { type: Schema.Types.ObjectId, ref: "Ministry", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    role: { type: String },
    contractSigned: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

ministryVolunteerSchema.index({ ministryId: 1, userId: 1 }, { unique: true });

export type MinistryVolunteerDocument = InferSchemaType<typeof ministryVolunteerSchema> & { _id: Types.ObjectId };

export const MinistryVolunteer = model("MinistryVolunteer", ministryVolunteerSchema);

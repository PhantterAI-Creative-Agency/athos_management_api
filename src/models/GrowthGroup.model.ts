import { Schema, model, Types, type InferSchemaType } from "mongoose";

const growthGroupSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    name: { type: String, required: true },
    leaderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    membersIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    hasPendencies: { type: Boolean, default: false },
    indicators: {
      attendanceRate: { type: Number, default: 0 },
      lastMeetingAt: { type: Date },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type GrowthGroupDocument = InferSchemaType<typeof growthGroupSchema> & { _id: Types.ObjectId };

export const GrowthGroup = model("GrowthGroup", growthGroupSchema);

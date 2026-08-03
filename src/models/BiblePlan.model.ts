import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { PLAN_SOURCES } from "../interfaces/plan.interface";

const biblePlanSchema = new Schema(
  {
    title: { type: String, required: true },
    coverUrl: { type: String, required: true },
    durationDays: { type: Number, required: true },
    themes: { type: [String], default: [] },
    rating: { type: Number, default: 0 },
    source: { type: String, enum: PLAN_SOURCES, default: "internal" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type BiblePlanDocument = InferSchemaType<typeof biblePlanSchema> & { _id: Types.ObjectId };

export const BiblePlan = model("BiblePlan", biblePlanSchema);

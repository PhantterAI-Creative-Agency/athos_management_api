import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { PLAN_PROGRESS_STATUSES } from "../interfaces/plan.interface";

const planProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    planId: { type: Schema.Types.ObjectId, ref: "BiblePlan", required: true, index: true },
    status: { type: String, enum: PLAN_PROGRESS_STATUSES, default: "saved" },
    currentDay: { type: Number, default: 0 },
    totalDays: { type: Number, required: true },
    completedAt: { type: Date },
    friendsAlsoCompletedIds: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

planProgressSchema.index({ userId: 1, planId: 1 }, { unique: true });

export type PlanProgressDocument = InferSchemaType<typeof planProgressSchema> & { _id: Types.ObjectId };

export const PlanProgress = model("PlanProgress", planProgressSchema);

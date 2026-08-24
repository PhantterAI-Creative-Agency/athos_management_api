import { Schema, model, Types, type InferSchemaType } from "mongoose";

const ministryScheduleSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    ministryId: { type: Schema.Types.ObjectId, ref: "Ministry", required: true, index: true },
    date: { type: Date, required: true },
    title: { type: String },
    notes: { type: String },
    assignments: {
      type: [
        {
          functionId: { type: Schema.Types.ObjectId, required: true },
          functionName: { type: String, required: true },
          volunteerIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
        },
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

ministryScheduleSchema.index({ ministryId: 1, date: 1 });

export type MinistryScheduleDocument = InferSchemaType<typeof ministryScheduleSchema> & { _id: Types.ObjectId };

export const MinistrySchedule = model("MinistrySchedule", ministryScheduleSchema);

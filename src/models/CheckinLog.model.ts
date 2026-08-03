import { Schema, model, Types, type InferSchemaType } from "mongoose";

const checkinLogSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventId: { type: Schema.Types.ObjectId, ref: "Event" },
    checkedInBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tokenId: { type: String, required: true, unique: true },
    checkedInAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type CheckinLogDocument = InferSchemaType<typeof checkinLogSchema> & { _id: Types.ObjectId };

export const CheckinLog = model("CheckinLog", checkinLogSchema);

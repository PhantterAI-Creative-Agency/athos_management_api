import { Schema, model, Types, type InferSchemaType } from "mongoose";

const adSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    format: { type: String, enum: ["card", "slide"], required: true },
    placement: { type: String, required: true, index: true },
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkUrl: { type: String },
    active: { type: Boolean, required: true, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    order: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type AdDocument = InferSchemaType<typeof adSchema> & { _id: Types.ObjectId };

export const Ad = model("Ad", adSchema);

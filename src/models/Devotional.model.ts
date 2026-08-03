import { Schema, model, Types, type InferSchemaType } from "mongoose";

const devotionalSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    publishedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type DevotionalDocument = InferSchemaType<typeof devotionalSchema> & { _id: Types.ObjectId };

export const Devotional = model("Devotional", devotionalSchema);

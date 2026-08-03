import { Schema, model, Types, type InferSchemaType } from "mongoose";

const mediaSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    type: { type: String, enum: ["video", "photo"], required: true },
    category: { type: String, required: true },
    title: { type: String, required: true },
    youtubeId: { type: String },
    url: { type: String },
  },
  { timestamps: { updatedAt: false } },
);

export type MediaDocument = InferSchemaType<typeof mediaSchema> & { _id: Types.ObjectId };

export const Media = model("Media", mediaSchema);

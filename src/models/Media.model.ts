import { Schema, model, Types, type InferSchemaType } from "mongoose";

const mediaSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    type: { type: String, enum: ["video", "photo"], required: true },
    category: { type: String, required: true },
    title: { type: String, required: true },
    youtubeId: { type: String },
    url: { type: String },
    source: { type: String, enum: ["manual", "youtube_sync"], required: true, default: "manual" },
  },
  { timestamps: { updatedAt: false } },
);

export type MediaDocument = InferSchemaType<typeof mediaSchema> & { _id: Types.ObjectId };

export const Media = model("Media", mediaSchema);

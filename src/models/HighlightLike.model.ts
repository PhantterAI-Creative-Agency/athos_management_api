import { Schema, model, Types, type InferSchemaType } from "mongoose";

const highlightLikeSchema = new Schema(
  {
    highlightId: { type: Schema.Types.ObjectId, ref: "Highlight", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

highlightLikeSchema.index({ highlightId: 1, userId: 1 }, { unique: true });

export type HighlightLikeDocument = InferSchemaType<typeof highlightLikeSchema> & { _id: Types.ObjectId };

export const HighlightLike = model("HighlightLike", highlightLikeSchema);

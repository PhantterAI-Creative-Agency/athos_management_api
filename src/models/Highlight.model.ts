import { Schema, model, Types, type InferSchemaType } from "mongoose";

const highlightSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    book: { type: String, required: true },
    chapter: { type: Number, required: true },
    verseStart: { type: Number, required: true },
    verseEnd: { type: Number },
    version: { type: String, required: true },
    text: { type: String, required: true },
    likesCount: { type: Number, default: 0 },
    visibility: { type: String, enum: ["public", "friends"], required: true, default: "public" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

highlightSchema.index({ userId: 1, createdAt: -1 });

export type HighlightDocument = InferSchemaType<typeof highlightSchema> & { _id: Types.ObjectId };

export const Highlight = model("Highlight", highlightSchema);

import { Schema, model, Types, type InferSchemaType } from "mongoose";

const muralPostSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    authorType: { type: String, enum: ["user", "church"], required: true },
    authorId: { type: Schema.Types.ObjectId, required: true },
    content: { type: String, required: true },
    audience: { type: String, enum: ["all", "ministry", "growthGroup"], required: true, default: "all" },
    audienceRefId: { type: Schema.Types.ObjectId },
    likesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

muralPostSchema.index({ churchId: 1, createdAt: -1 });

export type MuralPostDocument = InferSchemaType<typeof muralPostSchema> & { _id: Types.ObjectId };

export const MuralPost = model("MuralPost", muralPostSchema);

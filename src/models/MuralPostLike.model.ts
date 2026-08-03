import { Schema, model, Types, type InferSchemaType } from "mongoose";

const muralPostLikeSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: "MuralPost", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

muralPostLikeSchema.index({ postId: 1, userId: 1 }, { unique: true });

export type MuralPostLikeDocument = InferSchemaType<typeof muralPostLikeSchema> & { _id: Types.ObjectId };

export const MuralPostLike = model("MuralPostLike", muralPostLikeSchema);

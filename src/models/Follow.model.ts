import { Schema, model, Types, type InferSchemaType } from "mongoose";

const followSchema = new Schema(
  {
    followerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    followingId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

export type FollowDocument = InferSchemaType<typeof followSchema> & { _id: Types.ObjectId };

export const Follow = model("Follow", followSchema);

import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { FRIENDSHIP_STATUSES } from "../interfaces/friend.interface";

const friendshipSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    friendId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: FRIENDSHIP_STATUSES, default: "pending" },
    mutualFriendsCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

friendshipSchema.index({ userId: 1, friendId: 1 }, { unique: true });

export type FriendshipDocument = InferSchemaType<typeof friendshipSchema> & { _id: Types.ObjectId };

export const Friendship = model("Friendship", friendshipSchema);

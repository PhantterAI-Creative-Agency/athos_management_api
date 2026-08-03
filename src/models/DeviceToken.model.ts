import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { DEVICE_TOKEN_PLATFORMS } from "../interfaces/notification.interface";

const deviceTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    platform: { type: String, enum: DEVICE_TOKEN_PLATFORMS, required: true },
    token: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

deviceTokenSchema.index({ userId: 1, platform: 1 }, { unique: true });

export type DeviceTokenDocument = InferSchemaType<typeof deviceTokenSchema> & { _id: Types.ObjectId };

export const DeviceToken = model("DeviceToken", deviceTokenSchema);

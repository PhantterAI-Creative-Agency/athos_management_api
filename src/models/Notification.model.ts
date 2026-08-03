import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { NOTIFICATION_TYPES } from "../interfaces/notification.interface";

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & { _id: Types.ObjectId };

export const Notification = model("Notification", notificationSchema);

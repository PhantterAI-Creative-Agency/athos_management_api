import { Schema, model, Types, type InferSchemaType } from "mongoose";

export const CHAT_MESSAGE_ROLES = ["user", "assistant"] as const;
export const CHAT_MESSAGE_CATEGORIES = ["system_question", "pastoral_care", "other"] as const;

const chatMessageSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    guestName: { type: String },
    guestWhatsapp: { type: String },
    sessionId: { type: String, required: true, index: true },
    role: { type: String, enum: CHAT_MESSAGE_ROLES, required: true },
    content: { type: String, required: true },
    category: { type: String, enum: CHAT_MESSAGE_CATEGORIES },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

chatMessageSchema.index({ sessionId: 1, createdAt: 1 });

export type ChatMessageDocument = InferSchemaType<typeof chatMessageSchema> & { _id: Types.ObjectId };

export const ChatMessage = model("ChatMessage", chatMessageSchema);

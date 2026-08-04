import { Schema, model, Types, type InferSchemaType } from "mongoose";

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type ContactMessageDocument = InferSchemaType<typeof contactMessageSchema> & { _id: Types.ObjectId };

export const ContactMessage = model("ContactMessage", contactMessageSchema);

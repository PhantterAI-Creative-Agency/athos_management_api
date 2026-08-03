import { Schema, model, Types, type InferSchemaType } from "mongoose";

const eventSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    featuredImageUrl: { type: String },
    date: { type: Date, required: true, index: true },
    location: { type: String },
    price: { type: Number },
    featured: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type EventDocument = InferSchemaType<typeof eventSchema> & { _id: Types.ObjectId };

export const Event = model("Event", eventSchema);

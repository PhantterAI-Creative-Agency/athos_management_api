import { Schema, model, Types, type InferSchemaType } from "mongoose";

const jingleSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    title: { type: String, required: true },
    url: { type: String, required: true },
    active: { type: Boolean, required: true, default: true },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export type JingleDocument = InferSchemaType<typeof jingleSchema> & { _id: Types.ObjectId };

export const Jingle = model("Jingle", jingleSchema);

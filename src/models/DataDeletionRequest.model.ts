import { Schema, model, Types, type InferSchemaType } from "mongoose";

const dataDeletionRequestSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    reason: { type: String },
    includeChildren: { type: Boolean, default: false },
    status: { type: String, enum: ["pending", "completed"], default: "pending" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type DataDeletionRequestDocument = InferSchemaType<typeof dataDeletionRequestSchema> & {
  _id: Types.ObjectId;
};

export const DataDeletionRequest = model("DataDeletionRequest", dataDeletionRequestSchema);

import { Schema, model, Types, type InferSchemaType } from "mongoose";

const ministrySchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    name: { type: String, required: true },
    iconUrl: { type: String },
    contractRequired: { type: Boolean, default: false },
    participantsCount: { type: Number, default: 0 },
    leader: { type: Schema.Types.ObjectId, ref: "User", default: null },
    serviceFunctions: {
      type: [
        {
          name: { type: String, required: true },
          order: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type MinistryDocument = InferSchemaType<typeof ministrySchema> & { _id: Types.ObjectId };

export const Ministry = model("Ministry", ministrySchema);

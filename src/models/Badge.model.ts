import { Schema, model, Types, type InferSchemaType } from "mongoose";

const badgeCriteriaSchema = new Schema(
  {
    type: { type: String, required: true },
    target: { type: Number, required: true },
  },
  { _id: false },
);

const badgeSchema = new Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  iconUrl: { type: String, required: true },
  criteria: { type: badgeCriteriaSchema, required: true },
});

export type BadgeDocument = InferSchemaType<typeof badgeSchema> & { _id: Types.ObjectId };

export const Badge = model("Badge", badgeSchema);

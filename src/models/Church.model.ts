import { Schema, model, type InferSchemaType } from "mongoose";

const churchSchema = new Schema(
  {
    name: { type: String, required: true },
    logoUrl: { type: String, required: true },
    address: { type: String },
    addressDetails: {
      cep: { type: String },
      street: { type: String },
      number: { type: String },
      complement: { type: String },
      neighborhood: { type: String },
      city: { type: String },
      state: { type: String },
    },
    phone: { type: String },
    about: { type: String },
    slug: { type: String, required: true, unique: true },
    settings: {
      primaryColor: { type: String, required: true, default: "#000000" },
      growthGroupName: { type: String, required: true, default: "Grupos de Crescimento" },
      growthGroupAcronym: { type: String, required: true, default: "GC" },
      youtubeChannelId: { type: String },
      adsEnabled: { type: Boolean, required: true, default: true },
      disabledAdPlacements: { type: [String], required: true, default: [] },
    },
    homeContent: {
      intro: { type: String },
      mission: { type: String },
      vision: { type: String },
      values: { type: String },
      bannerEventId: { type: Schema.Types.ObjectId, ref: "Event" },
    },
    contact: {
      email: { type: String },
      whatsapp: { type: String },
      phone: { type: String },
      socialLinks: [
        {
          platform: { type: String, required: true },
          url: { type: String, required: true },
          _id: false,
        },
      ],
    },
    socialLinks: {
      facebook: { type: String },
      instagram: { type: String },
      youtube: { type: String },
    },
    serviceSchedule: [
      {
        day: { type: String, required: true },
        time: { type: String, required: true },
        theme: { type: String, required: true },
      },
    ],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type ChurchDocument = InferSchemaType<typeof churchSchema>;

export const Church = model("Church", churchSchema);

import { Schema, model, Types, type InferSchemaType } from "mongoose";

const radioTrackSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    type: { type: String, enum: ["music", "jingle"], required: true, index: true },
    title: { type: String, required: true },
    artist: { type: String },
    // Caminho relativo a UPLOAD_DIR quando o arquivo foi enviado pelo admin.
    filePath: { type: String },
    // URL externa (vinhetas antigas cadastradas por link).
    url: { type: String },
    originalName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
    durationSec: { type: Number },
  },
  { timestamps: true },
);

export type RadioTrackDocument = InferSchemaType<typeof radioTrackSchema> & { _id: Types.ObjectId };

export const RadioTrack = model("RadioTrack", radioTrackSchema);

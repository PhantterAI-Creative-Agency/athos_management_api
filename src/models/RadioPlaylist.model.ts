import { Schema, model, Types, type InferSchemaType } from "mongoose";

const radioPlaylistItemSchema = new Schema({
  trackId: { type: Schema.Types.ObjectId, ref: "RadioTrack", required: true },
});

const radioPlaylistSchema = new Schema(
  {
    churchId: { type: Schema.Types.ObjectId, ref: "Church", required: true, index: true },
    name: { type: String, required: true },
    active: { type: Boolean, required: true, default: true },
    order: { type: Number, required: true, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    items: { type: [radioPlaylistItemSchema], default: [] },
  },
  { timestamps: true },
);

export type RadioPlaylistDocument = InferSchemaType<typeof radioPlaylistSchema> & { _id: Types.ObjectId };

export const RadioPlaylist = model("RadioPlaylist", radioPlaylistSchema);

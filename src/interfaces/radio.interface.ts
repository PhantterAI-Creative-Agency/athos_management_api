import { z } from "zod";

export const RADIO_TRACK_TYPES = ["music", "jingle"] as const;
export type RadioTrackType = (typeof RADIO_TRACK_TYPES)[number];

export const listRadioTracksQuerySchema = z.object({
  type: z.enum(RADIO_TRACK_TYPES).optional(),
});

export type ListRadioTracksQueryDTO = z.infer<typeof listRadioTracksQuerySchema>;

export const uploadRadioTrackQuerySchema = z.object({
  type: z.enum(RADIO_TRACK_TYPES, { message: "Tipo deve ser music ou jingle" }),
  title: z.string().optional(),
  duration: z.coerce.number().nonnegative().optional(),
});

export type UploadRadioTrackQueryDTO = z.infer<typeof uploadRadioTrackQuerySchema>;

export const updateRadioTrackSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").optional(),
  artist: z.string().optional(),
});

export type UpdateRadioTrackDTO = z.infer<typeof updateRadioTrackSchema>;

const nullableDate = z.string().datetime({ offset: true, message: "Data inválida" }).nullable().optional();

export const createRadioPlaylistSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  active: z.boolean().optional(),
  startsAt: nullableDate,
  endsAt: nullableDate,
  trackIds: z.array(z.string()).optional(),
});

export type CreateRadioPlaylistDTO = z.infer<typeof createRadioPlaylistSchema>;

export const updateRadioPlaylistSchema = createRadioPlaylistSchema.partial();

export type UpdateRadioPlaylistDTO = z.infer<typeof updateRadioPlaylistSchema>;

export const reorderRadioPlaylistsSchema = z.object({
  ids: z.array(z.string()).min(1, "Informe a ordem das playlists"),
});

export type ReorderRadioPlaylistsDTO = z.infer<typeof reorderRadioPlaylistsSchema>;

export interface RadioTrackDTO {
  id: string;
  churchId: string;
  type: RadioTrackType;
  title: string;
  artist: string | null;
  /** Caminho relativo à base da API (ex.: /uploads/radio/...) ou URL absoluta. */
  url: string;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  durationSec: number | null;
  createdAt: string;
}

export interface RadioPlaylistItemDTO {
  id: string;
  track: RadioTrackDTO;
}

export interface RadioPlaylistDTO {
  id: string;
  churchId: string;
  name: string;
  active: boolean;
  order: number;
  startsAt: string | null;
  endsAt: string | null;
  items: RadioPlaylistItemDTO[];
  durationSec: number;
  createdAt: string;
}

export interface PublicRadioDTO {
  playlists: RadioPlaylistDTO[];
  /** Próximo momento em que alguma playlist começa ou termina. */
  nextChangeAt: string | null;
}

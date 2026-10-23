import path from "node:path";
import type { Request } from "express";
import { isValidObjectId } from "mongoose";
import { RadioTrack } from "../models/RadioTrack.model";
import { RadioPlaylist } from "../models/RadioPlaylist.model";
import { Jingle } from "../models/Jingle.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { removeUploadedFile, saveRequestBodyToFile } from "../helpers/upload.helper";
import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";
import type {
  CreateRadioPlaylistDTO,
  ListRadioTracksQueryDTO,
  PublicRadioDTO,
  RadioPlaylistDTO,
  RadioTrackDTO,
  RadioTrackType,
  ReorderRadioPlaylistsDTO,
  UpdateRadioPlaylistDTO,
  UpdateRadioTrackDTO,
  UploadRadioTrackQueryDTO,
} from "../interfaces/radio.interface";

const ALLOWED_AUDIO_EXTENSIONS: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};

type RadioTrackDocumentLike = {
  _id: unknown;
  churchId: unknown;
  type: string;
  title: string;
  artist?: string | null;
  filePath?: string | null;
  url?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  durationSec?: number | null;
  createdAt?: Date;
};

type RadioPlaylistDocumentLike = {
  _id: unknown;
  churchId: unknown;
  name: string;
  active: boolean;
  order: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  items: { _id?: unknown; trackId: unknown }[];
  createdAt?: Date;
};

function toRadioTrackDTO(track: RadioTrackDocumentLike): RadioTrackDTO {
  return {
    id: String(track._id),
    churchId: String(track.churchId),
    type: track.type as RadioTrackType,
    title: track.title,
    artist: track.artist ?? null,
    url: track.filePath ? `/uploads/${track.filePath}` : (track.url ?? ""),
    originalName: track.originalName ?? null,
    mimeType: track.mimeType ?? null,
    size: track.size ?? null,
    durationSec: track.durationSec ?? null,
    createdAt: track.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function toRadioPlaylistDTO(
  playlist: RadioPlaylistDocumentLike,
  tracksById: Map<string, RadioTrackDTO>,
): RadioPlaylistDTO {
  const items = playlist.items.flatMap((item) => {
    const track = tracksById.get(String(item.trackId));
    return track ? [{ id: String(item._id), track }] : [];
  });

  return {
    id: String(playlist._id),
    churchId: String(playlist.churchId),
    name: playlist.name,
    active: playlist.active,
    order: playlist.order,
    startsAt: playlist.startsAt?.toISOString() ?? null,
    endsAt: playlist.endsAt?.toISOString() ?? null,
    items,
    durationSec: items.reduce((total, item) => total + (item.track.durationSec ?? 0), 0),
    createdAt: playlist.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

async function toRadioPlaylistDTOs(playlists: RadioPlaylistDocumentLike[]): Promise<RadioPlaylistDTO[]> {
  const trackIds = [...new Set(playlists.flatMap((playlist) => playlist.items.map((item) => String(item.trackId))))];
  const tracks = trackIds.length ? await RadioTrack.find({ _id: { $in: trackIds } }) : [];
  const tracksById = new Map(tracks.map((track) => [String(track._id), toRadioTrackDTO(track)]));

  return playlists.map((playlist) => toRadioPlaylistDTO(playlist, tracksById));
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function belongsToRequester(requester: AuthTokenPayload, churchId: unknown): boolean {
  return isDevAdmin(requester) || String(churchId) === requester.churchId;
}

async function findTrackScoped(requester: AuthTokenPayload, trackId: string) {
  const track = isValidObjectId(trackId) ? await RadioTrack.findById(trackId) : null;

  if (!track || !belongsToRequester(requester, track.churchId)) {
    throw new AppError(404, "RADIO_TRACK_NOT_FOUND", "Áudio não encontrado");
  }

  return track;
}

async function findPlaylistScoped(requester: AuthTokenPayload, playlistId: string) {
  const playlist = isValidObjectId(playlistId) ? await RadioPlaylist.findById(playlistId) : null;

  if (!playlist || !belongsToRequester(requester, playlist.churchId)) {
    throw new AppError(404, "RADIO_PLAYLIST_NOT_FOUND", "Playlist não encontrada");
  }

  return playlist;
}

function decodeFileName(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return "";
  try {
    return path.basename(decodeURIComponent(raw));
  } catch {
    return path.basename(raw);
  }
}

export async function uploadTrack(
  requester: AuthTokenPayload,
  req: Request,
  query: UploadRadioTrackQueryDTO,
): Promise<RadioTrackDTO> {
  const originalName = decodeFileName(req.headers["x-file-name"]);
  const extension = path.extname(originalName).toLowerCase();
  const contentType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();

  if (!ALLOWED_AUDIO_EXTENSIONS[extension]) {
    throw new AppError(
      400,
      "INVALID_AUDIO_FORMAT",
      "Formato de áudio não suportado. Use MP3, M4A, AAC, OGG, OPUS, WAV, FLAC ou WEBM.",
    );
  }

  if (contentType && !contentType.startsWith("audio/") && contentType !== "application/octet-stream") {
    throw new AppError(400, "INVALID_AUDIO_FORMAT", "O arquivo enviado não é um áudio");
  }

  const { filePath, size } = await saveRequestBodyToFile(
    req,
    path.posix.join("radio", requester.churchId),
    extension,
    env.RADIO_MAX_UPLOAD_MB * 1024 * 1024,
  );

  const title = query.title?.trim() || path.basename(originalName, path.extname(originalName)) || "Sem título";

  try {
    const track = await RadioTrack.create({
      churchId: requester.churchId,
      type: query.type,
      title,
      filePath,
      originalName,
      mimeType: contentType.startsWith("audio/") ? contentType : ALLOWED_AUDIO_EXTENSIONS[extension],
      size,
      durationSec: query.duration,
    });

    return toRadioTrackDTO(track);
  } catch (error) {
    await removeUploadedFile(filePath);
    throw error;
  }
}

export async function listTracks(requester: AuthTokenPayload, query: ListRadioTracksQueryDTO): Promise<RadioTrackDTO[]> {
  const filter: Record<string, unknown> = { churchId: requester.churchId };
  if (query.type) filter.type = query.type;

  const tracks = await RadioTrack.find(filter).sort({ createdAt: -1 });

  return tracks.map(toRadioTrackDTO);
}

export async function updateTrack(
  requester: AuthTokenPayload,
  trackId: string,
  data: UpdateRadioTrackDTO,
): Promise<RadioTrackDTO> {
  const track = await findTrackScoped(requester, trackId);

  if (data.title !== undefined) track.title = data.title;
  if (data.artist !== undefined) track.artist = data.artist || undefined;

  await track.save();

  return toRadioTrackDTO(track);
}

export async function deleteTrack(requester: AuthTokenPayload, trackId: string): Promise<void> {
  const track = await findTrackScoped(requester, trackId);

  await RadioPlaylist.updateMany({ churchId: track.churchId }, { $pull: { items: { trackId: track._id } } });
  await track.deleteOne();

  if (track.filePath) await removeUploadedFile(track.filePath);
}

async function resolveTrackIds(churchId: string, trackIds: string[]): Promise<{ trackId: string }[]> {
  const uniqueIds = [...new Set(trackIds)];

  if (uniqueIds.some((id) => !isValidObjectId(id))) {
    throw new AppError(400, "INVALID_RADIO_TRACK", "Há áudios inválidos na playlist");
  }

  const count = uniqueIds.length ? await RadioTrack.countDocuments({ _id: { $in: uniqueIds }, churchId }) : 0;

  if (count !== uniqueIds.length) {
    throw new AppError(400, "INVALID_RADIO_TRACK", "Há áudios inválidos na playlist");
  }

  return trackIds.map((trackId) => ({ trackId }));
}

function parseNullableDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
}

function assertValidPeriod(startsAt: Date | null | undefined, endsAt: Date | null | undefined): void {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw new AppError(400, "INVALID_PERIOD", "O término deve ser depois do início");
  }
}

export async function createPlaylist(
  requester: AuthTokenPayload,
  data: CreateRadioPlaylistDTO,
): Promise<RadioPlaylistDTO> {
  const startsAt = parseNullableDate(data.startsAt) ?? null;
  const endsAt = parseNullableDate(data.endsAt) ?? null;
  assertValidPeriod(startsAt, endsAt);

  const items = await resolveTrackIds(requester.churchId, data.trackIds ?? []);
  const last = await RadioPlaylist.findOne({ churchId: requester.churchId }).sort({ order: -1 });

  const playlist = await RadioPlaylist.create({
    churchId: requester.churchId,
    name: data.name,
    active: data.active ?? true,
    order: last ? last.order + 1 : 0,
    startsAt,
    endsAt,
    items,
  });

  const [dto] = await toRadioPlaylistDTOs([playlist]);
  return dto;
}

export async function listPlaylists(requester: AuthTokenPayload): Promise<RadioPlaylistDTO[]> {
  const playlists = await RadioPlaylist.find({ churchId: requester.churchId }).sort({ order: 1, createdAt: 1 });

  return toRadioPlaylistDTOs(playlists);
}

export async function getPlaylist(requester: AuthTokenPayload, playlistId: string): Promise<RadioPlaylistDTO> {
  const playlist = await findPlaylistScoped(requester, playlistId);

  const [dto] = await toRadioPlaylistDTOs([playlist]);
  return dto;
}

export async function updatePlaylist(
  requester: AuthTokenPayload,
  playlistId: string,
  data: UpdateRadioPlaylistDTO,
): Promise<RadioPlaylistDTO> {
  const playlist = await findPlaylistScoped(requester, playlistId);

  const startsAt = parseNullableDate(data.startsAt);
  const endsAt = parseNullableDate(data.endsAt);
  assertValidPeriod(
    startsAt === undefined ? playlist.startsAt : startsAt,
    endsAt === undefined ? playlist.endsAt : endsAt,
  );

  if (data.name !== undefined) playlist.name = data.name;
  if (data.active !== undefined) playlist.active = data.active;
  if (startsAt !== undefined) playlist.startsAt = startsAt;
  if (endsAt !== undefined) playlist.endsAt = endsAt;
  if (data.trackIds !== undefined) {
    playlist.set("items", await resolveTrackIds(String(playlist.churchId), data.trackIds));
  }

  await playlist.save();

  const [dto] = await toRadioPlaylistDTOs([playlist]);
  return dto;
}

export async function reorderPlaylists(
  requester: AuthTokenPayload,
  data: ReorderRadioPlaylistsDTO,
): Promise<RadioPlaylistDTO[]> {
  const validIds = data.ids.filter((id) => isValidObjectId(id));

  await RadioPlaylist.bulkWrite(
    validIds.map((id, index) => ({
      updateOne: { filter: { _id: id, churchId: requester.churchId }, update: { $set: { order: index } } },
    })),
  );

  return listPlaylists(requester);
}

export async function deletePlaylist(requester: AuthTokenPayload, playlistId: string): Promise<void> {
  const playlist = await findPlaylistScoped(requester, playlistId);

  await playlist.deleteOne();
}

/** Playlists ativas no momento, na ordem definida no admin, e quando a programação muda. */
export async function getRadioPublic(churchId: string, now = new Date()): Promise<PublicRadioDTO> {
  const playlists = await RadioPlaylist.find({ churchId, active: true }).sort({ order: 1, createdAt: 1 });

  const live = playlists.filter(
    (playlist) => (!playlist.startsAt || playlist.startsAt <= now) && (!playlist.endsAt || playlist.endsAt > now),
  );

  const upcomingChanges = playlists
    .flatMap((playlist) => [playlist.startsAt, playlist.endsAt])
    .filter((date): date is Date => !!date && date > now)
    .sort((a, b) => a.getTime() - b.getTime());

  const dtos = await toRadioPlaylistDTOs(live);

  return {
    playlists: dtos.filter((playlist) => playlist.items.length > 0),
    nextChangeAt: upcomingChanges[0]?.toISOString() ?? null,
  };
}

/** Converte as vinhetas do modelo antigo (só URL) em áudios da rádio e numa playlist "Vinhetas". */
export async function migrateLegacyJingles(): Promise<void> {
  const jingles = await Jingle.find().sort({ order: 1, createdAt: 1 });
  if (!jingles.length) return;

  const byChurch = new Map<string, typeof jingles>();
  for (const jingle of jingles) {
    const key = String(jingle.churchId);
    byChurch.set(key, [...(byChurch.get(key) ?? []), jingle]);
  }

  for (const [churchId, churchJingles] of byChurch) {
    const tracks = await RadioTrack.insertMany(
      churchJingles.map((jingle) => ({ churchId, type: "jingle", title: jingle.title, url: jingle.url })),
    );

    const activeTrackIds = tracks.filter((_, index) => churchJingles[index].active).map((track) => track._id);
    const hasPlaylists = await RadioPlaylist.exists({ churchId });

    if (activeTrackIds.length && !hasPlaylists) {
      await RadioPlaylist.create({
        churchId,
        name: "Vinhetas",
        active: true,
        order: 0,
        items: activeTrackIds.map((trackId) => ({ trackId })),
      });
    }

    await Jingle.deleteMany({ _id: { $in: churchJingles.map((jingle) => jingle._id) } });
  }
}

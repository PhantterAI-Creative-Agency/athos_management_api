import { Media } from "../models/Media.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type { CreateMediaDTO, MediaDTO, UpdateMediaDTO } from "../interfaces/media.interface";

type MediaDocumentLike = {
  _id: unknown;
  churchId: unknown;
  type: "video" | "photo";
  category: string;
  title: string;
  youtubeId?: string | null;
  url?: string | null;
  createdAt?: Date;
};

function toMediaDTO(media: MediaDocumentLike): MediaDTO {
  return {
    id: String(media._id),
    churchId: String(media.churchId),
    type: media.type,
    category: media.category,
    title: media.title,
    youtubeId: media.youtubeId ?? undefined,
    url: media.url ?? undefined,
    createdAt: media.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdmin(requester: AuthTokenPayload): boolean {
  return isDevAdmin(requester) || requester.roles.includes("admin");
}

async function findMediaScoped(requester: AuthTokenPayload, mediaId: string) {
  const media = await Media.findById(mediaId);

  if (!media) {
    throw new AppError(404, "MEDIA_NOT_FOUND", "Mídia não encontrada");
  }

  if (!isDevAdmin(requester) && String(media.churchId) !== requester.churchId) {
    throw new AppError(404, "MEDIA_NOT_FOUND", "Mídia não encontrada");
  }

  return media;
}

export async function createMedia(requester: AuthTokenPayload, data: CreateMediaDTO): Promise<MediaDTO> {
  const churchId = isDevAdmin(requester) && data.churchId ? data.churchId : requester.churchId;

  const media = await Media.create({
    churchId,
    type: data.type,
    category: data.category,
    title: data.title,
    youtubeId: data.youtubeId ?? undefined,
    url: data.url ?? undefined,
  });

  return toMediaDTO(media);
}

export async function listMedia(requester: AuthTokenPayload): Promise<MediaDTO[]> {
  const filter: Record<string, unknown> = { churchId: requester.churchId };

  const mediaList = await Media.find(filter).sort({ createdAt: -1 });

  return mediaList.map(toMediaDTO);
}

export async function listMediaPublic(churchId: string): Promise<MediaDTO[]> {
  const mediaList = await Media.find({ churchId }).sort({ createdAt: -1 }).limit(5);

  return mediaList.map(toMediaDTO);
}

export async function getMedia(requester: AuthTokenPayload, mediaId: string): Promise<MediaDTO> {
  const media = await findMediaScoped(requester, mediaId);

  return toMediaDTO(media);
}

export async function updateMedia(
  requester: AuthTokenPayload,
  mediaId: string,
  data: UpdateMediaDTO,
): Promise<MediaDTO> {
  const media = await findMediaScoped(requester, mediaId);

  if (data.type !== undefined) media.type = data.type;
  if (data.category !== undefined) media.category = data.category;
  if (data.title !== undefined) media.title = data.title;
  if (data.youtubeId !== undefined) media.youtubeId = data.youtubeId;
  if (data.url !== undefined) media.url = data.url;

  await media.save();

  return toMediaDTO(media);
}

export async function deleteMedia(requester: AuthTokenPayload, mediaId: string): Promise<void> {
  const media = await findMediaScoped(requester, mediaId);

  await media.deleteOne();
}

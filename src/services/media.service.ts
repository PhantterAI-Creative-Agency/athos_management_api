import { Media } from "../models/Media.model";
import { Church } from "../models/Church.model";
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
  source?: "manual" | "youtube_sync" | null;
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
    source: media.source ?? "manual",
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

const YOUTUBE_SYNC_CATEGORY = "Vídeos";
const YOUTUBE_SYNC_LIMIT = 10;

interface YoutubeFeedEntry {
  videoId: string;
  title: string;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseYoutubeFeed(xml: string): YoutubeFeedEntry[] {
  return xml
    .split("<entry>")
    .slice(1)
    .map((block) => {
      const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
      const title = block.match(/<title>([^<]*)<\/title>/)?.[1];

      if (!videoId || !title) return null;

      return { videoId, title: decodeXmlEntities(title) };
    })
    .filter((entry): entry is YoutubeFeedEntry => entry !== null);
}

async function resolveYoutubeChannelId(youtubeUrl: string): Promise<string> {
  const res = await fetch(youtubeUrl, { headers: { "User-Agent": "Mozilla/5.0" } });

  if (!res.ok) {
    throw new AppError(502, "YOUTUBE_CHANNEL_LOOKUP_FAILED", "Não foi possível localizar o canal do YouTube");
  }

  const html = await res.text();
  const channelId = html.match(/"externalId":"([^"]+)"/)?.[1];

  if (!channelId) {
    throw new AppError(502, "YOUTUBE_CHANNEL_LOOKUP_FAILED", "Não foi possível localizar o canal do YouTube");
  }

  return channelId;
}

export async function syncYoutubeVideosForChurch(churchId: string): Promise<void> {
  const church = await Church.findById(churchId);

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  let channelId = church.settings?.youtubeChannelId;

  if (!channelId) {
    if (!church.socialLinks?.youtube) {
      throw new AppError(422, "YOUTUBE_CHANNEL_NOT_CONFIGURED", "Igreja não possui canal do YouTube configurado");
    }

    channelId = await resolveYoutubeChannelId(church.socialLinks.youtube);
    church.set("settings.youtubeChannelId", channelId);
    await church.save();
  }

  const feedRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);

  if (!feedRes.ok) {
    throw new AppError(502, "YOUTUBE_FEED_UNAVAILABLE", "Não foi possível buscar os vídeos do canal");
  }

  const entries = parseYoutubeFeed(await feedRes.text()).slice(0, YOUTUBE_SYNC_LIMIT);
  const syncedVideoIds = entries.map((entry) => entry.videoId);

  await Promise.all(
    entries.map((entry) =>
      Media.findOneAndUpdate(
        { churchId, youtubeId: entry.videoId },
        {
          $set: { title: entry.title, type: "video", source: "youtube_sync" },
          $setOnInsert: { churchId, youtubeId: entry.videoId, category: YOUTUBE_SYNC_CATEGORY },
        },
        { upsert: true },
      ),
    ),
  );

  await Media.deleteMany({
    churchId,
    source: "youtube_sync",
    youtubeId: { $nin: syncedVideoIds },
  });
}

export async function syncYoutubeVideos(requester: AuthTokenPayload, churchId?: string): Promise<MediaDTO[]> {
  const targetChurchId = isDevAdmin(requester) && churchId ? churchId : requester.churchId;

  await syncYoutubeVideosForChurch(targetChurchId);

  return listMedia({ ...requester, churchId: targetChurchId });
}

export async function syncYoutubeVideosForAllChurches(): Promise<void> {
  const churches = await Church.find({
    $or: [{ "settings.youtubeChannelId": { $exists: true, $ne: null } }, { "socialLinks.youtube": { $exists: true, $ne: null } }],
  }).select("_id");

  for (const church of churches) {
    await syncYoutubeVideosForChurch(String(church._id));
  }
}

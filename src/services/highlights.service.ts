import { Highlight } from "../models/Highlight.model";
import { HighlightLike } from "../models/HighlightLike.model";
import { AppError } from "../middlewares/errorHandler";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type {
  CreateHighlightDTO,
  HighlightDTO,
  ListHighlightsQueryDTO,
  ToggleHighlightLikeDTO,
} from "../interfaces/highlight.interface";

type HighlightDocumentLike = {
  _id: unknown;
  userId: unknown;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number | null;
  version: string;
  text: string;
  likesCount: number;
  visibility: HighlightDTO["visibility"];
  createdAt: Date;
};

function toHighlightDTO(highlight: HighlightDocumentLike, liked: boolean): HighlightDTO {
  return {
    id: String(highlight._id),
    userId: String(highlight.userId),
    book: highlight.book,
    chapter: highlight.chapter,
    verseStart: highlight.verseStart,
    verseEnd: highlight.verseEnd ?? undefined,
    version: highlight.version,
    text: highlight.text,
    likesCount: highlight.likesCount,
    visibility: highlight.visibility,
    liked,
    createdAt: highlight.createdAt.toISOString(),
  };
}

export async function createHighlight(
  requester: AuthTokenPayload,
  data: CreateHighlightDTO,
): Promise<HighlightDTO> {
  const highlight = await Highlight.create({
    userId: requester.sub,
    book: data.book,
    chapter: data.chapter,
    verseStart: data.verseStart,
    verseEnd: data.verseEnd,
    version: data.version,
    text: data.text,
    visibility: data.visibility,
  });

  return toHighlightDTO(highlight, false);
}

export async function listHighlights(
  requester: AuthTokenPayload,
  query: ListHighlightsQueryDTO,
): Promise<HighlightDTO[]> {
  const targetUserId = query.userId ?? requester.sub;
  const isOwnProfile = targetUserId === requester.sub;

  const filter: Record<string, unknown> = { userId: targetUserId };

  if (isOwnProfile) {
    if (query.visibility) {
      filter.visibility = query.visibility;
    }
  } else {
    // Destaques "friends" ainda não são liberados para terceiros: o modelo de amizade
    // (item 6 do plano) ainda não existe, então só "public" é exposto fora do próprio perfil.
    filter.visibility = "public";
  }

  const highlights = await Highlight.find(filter).sort({ createdAt: -1 });

  const likes = await HighlightLike.find({
    userId: requester.sub,
    highlightId: { $in: highlights.map((highlight) => highlight._id) },
  }).select("highlightId");

  const likedHighlightIds = new Set(likes.map((like) => String(like.highlightId)));

  return highlights.map((highlight) =>
    toHighlightDTO(highlight, likedHighlightIds.has(String(highlight._id))),
  );
}

export async function deleteHighlight(requester: AuthTokenPayload, highlightId: string): Promise<void> {
  const highlight = await Highlight.findById(highlightId);

  if (!highlight || String(highlight.userId) !== requester.sub) {
    throw new AppError(404, "HIGHLIGHT_NOT_FOUND", "Destaque não encontrado");
  }

  await HighlightLike.deleteMany({ highlightId: highlight._id });
  await highlight.deleteOne();
}

export async function toggleHighlightLike(
  requester: AuthTokenPayload,
  highlightId: string,
): Promise<ToggleHighlightLikeDTO> {
  const highlight = await Highlight.findById(highlightId);

  if (!highlight) {
    throw new AppError(404, "HIGHLIGHT_NOT_FOUND", "Destaque não encontrado");
  }

  const isOwnHighlight = String(highlight.userId) === requester.sub;

  if (highlight.visibility === "friends" && !isOwnHighlight) {
    throw new AppError(404, "HIGHLIGHT_NOT_FOUND", "Destaque não encontrado");
  }

  const existingLike = await HighlightLike.findOneAndDelete({
    highlightId: highlight._id,
    userId: requester.sub,
  });

  if (existingLike) {
    highlight.likesCount = Math.max(0, highlight.likesCount - 1);
    await highlight.save();
    return { liked: false, likesCount: highlight.likesCount };
  }

  await HighlightLike.create({ highlightId: highlight._id, userId: requester.sub });
  highlight.likesCount += 1;
  await highlight.save();

  return { liked: true, likesCount: highlight.likesCount };
}

import { Types } from "mongoose";
import { MuralPost } from "../models/MuralPost.model";
import { MuralPostLike } from "../models/MuralPostLike.model";
import { MinistryVolunteer } from "../models/MinistryVolunteer.model";
import { AppError } from "../middlewares/errorHandler";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type {
  CreateMuralPostDTO,
  ListMuralQueryDTO,
  MuralFeedDTO,
  MuralPostDTO,
  ToggleMuralLikeDTO,
} from "../interfaces/mural.interface";

type MuralPostDocumentLike = {
  _id: unknown;
  churchId: unknown;
  authorType: "user" | "church";
  authorId: unknown;
  content: string;
  audience: MuralPostDTO["audience"];
  audienceRefId?: unknown;
  likesCount: number;
  commentsCount: number;
  createdAt: Date;
};

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdmin(requester: AuthTokenPayload): boolean {
  return isDevAdmin(requester) || requester.roles.includes("admin");
}

function toMuralPostDTO(post: MuralPostDocumentLike, liked: boolean): MuralPostDTO {
  return {
    id: String(post._id),
    churchId: String(post.churchId),
    authorType: post.authorType,
    authorId: String(post.authorId),
    content: post.content,
    audience: post.audience,
    audienceRefId: post.audienceRefId ? String(post.audienceRefId) : undefined,
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    liked,
    createdAt: post.createdAt.toISOString(),
  };
}

function encodeCursor(post: { createdAt: Date; _id: unknown }): string {
  return Buffer.from(`${post.createdAt.toISOString()}_${String(post._id)}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("_");
    if (!createdAt || !id || Number.isNaN(new Date(createdAt).getTime())) {
      throw new Error("invalid cursor");
    }
    return { createdAt: new Date(createdAt), id };
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "Cursor inválido");
  }
}

export async function createMuralPost(
  requester: AuthTokenPayload,
  data: CreateMuralPostDTO,
): Promise<MuralPostDTO> {
  if (data.authorType === "church" && !isAdmin(requester)) {
    throw new AppError(403, "FORBIDDEN", "Apenas administradores podem postar como a igreja");
  }

  if (data.audience === "growthGroup" && !isAdmin(requester)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Postagens para grupos de crescimento ainda são restritas a administradores",
    );
  }

  if (data.audience === "ministry" && !isAdmin(requester)) {
    const isVolunteer = await MinistryVolunteer.exists({
      ministryId: data.audienceRefId,
      userId: requester.sub,
      churchId: requester.churchId,
      active: true,
    });

    if (!isVolunteer) {
      throw new AppError(403, "FORBIDDEN", "Você precisa ser voluntário do ministério para postar nele");
    }
  }

  const authorId = data.authorType === "church" ? requester.churchId : requester.sub;

  const post = await MuralPost.create({
    churchId: requester.churchId,
    authorType: data.authorType,
    authorId,
    content: data.content,
    audience: data.audience,
    audienceRefId: data.audienceRefId,
  });

  return toMuralPostDTO(post, false);
}

export async function listMural(
  requester: AuthTokenPayload,
  query: ListMuralQueryDTO,
): Promise<MuralFeedDTO> {
  const filter: Record<string, unknown> = { churchId: requester.churchId };

  if (!isAdmin(requester)) {
    const volunteerMinistries = await MinistryVolunteer.find({
      userId: requester.sub,
      churchId: requester.churchId,
      active: true,
    }).select("ministryId");

    filter.$or = [
      { audience: "all" },
      { audience: "ministry", audienceRefId: { $in: volunteerMinistries.map((v) => v.ministryId) } },
    ];
  }

  if (query.cursor) {
    const { createdAt, id } = decodeCursor(query.cursor);
    filter.$and = [
      {
        $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: new Types.ObjectId(id) } }],
      },
    ];
  }

  const posts = await MuralPost.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1);

  const hasMore = posts.length > query.limit;
  const page = hasMore ? posts.slice(0, query.limit) : posts;

  const likes = await MuralPostLike.find({
    userId: requester.sub,
    postId: { $in: page.map((post) => post._id) },
  }).select("postId");

  const likedPostIds = new Set(likes.map((like) => String(like.postId)));

  return {
    items: page.map((post) => toMuralPostDTO(post, likedPostIds.has(String(post._id)))),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : undefined,
  };
}

export async function deleteMuralPost(requester: AuthTokenPayload, postId: string): Promise<void> {
  const post = await MuralPost.findById(postId);

  if (!post || String(post.churchId) !== requester.churchId) {
    throw new AppError(404, "MURAL_POST_NOT_FOUND", "Post não encontrado");
  }

  const isOwnPost = post.authorType === "user" && String(post.authorId) === requester.sub;

  if (!isOwnPost && !isAdmin(requester)) {
    throw new AppError(403, "FORBIDDEN", "Você não pode remover este post");
  }

  await MuralPostLike.deleteMany({ postId: post._id });
  await post.deleteOne();
}

export async function toggleMuralLike(
  requester: AuthTokenPayload,
  postId: string,
): Promise<ToggleMuralLikeDTO> {
  const post = await MuralPost.findById(postId);

  if (!post || String(post.churchId) !== requester.churchId) {
    throw new AppError(404, "MURAL_POST_NOT_FOUND", "Post não encontrado");
  }

  const existingLike = await MuralPostLike.findOneAndDelete({ postId: post._id, userId: requester.sub });

  if (existingLike) {
    post.likesCount = Math.max(0, post.likesCount - 1);
    await post.save();
    return { liked: false, likesCount: post.likesCount };
  }

  await MuralPostLike.create({ postId: post._id, userId: requester.sub });
  post.likesCount += 1;
  await post.save();

  return { liked: true, likesCount: post.likesCount };
}

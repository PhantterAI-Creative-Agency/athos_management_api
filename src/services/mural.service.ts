import { Types } from "mongoose";
import { MuralPost } from "../models/MuralPost.model";
import { MuralPostLike } from "../models/MuralPostLike.model";
import { MinistryVolunteer } from "../models/MinistryVolunteer.model";
import { User } from "../models/User.model";
import { getAcceptedFriendIds, getFriendshipMap } from "./friends.service";
import { getFollowingIds } from "./follow.service";
import { AppError } from "../middlewares/errorHandler";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type {
  CreateMuralPostDTO,
  ListMuralQueryDTO,
  MuralFeedDTO,
  MuralFriendshipRelationStatus,
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
  visibility?: MuralPostDTO["visibility"];
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

function toMuralPostDTO(
  post: MuralPostDocumentLike,
  liked: boolean,
  requesterId: string,
  authorsById: Map<string, { name: string; photoUrl?: string }>,
  followingIds: Set<string>,
  friendshipMap: Map<string, { status: "pending" | "accepted"; direction: "sent" | "received" }>,
): MuralPostDTO {
  const authorId = String(post.authorId);
  const isUserAuthor = post.authorType === "user";
  const isSelf = isUserAuthor && authorId === requesterId;
  const author = isUserAuthor ? authorsById.get(authorId) : undefined;

  let viewerFriendshipStatus: MuralFriendshipRelationStatus | undefined;
  if (isUserAuthor && !isSelf) {
    const friendship = friendshipMap.get(authorId);
    viewerFriendshipStatus = !friendship
      ? "none"
      : friendship.status === "accepted"
        ? "accepted"
        : friendship.direction === "sent"
          ? "pending_sent"
          : "pending_received";
  }

  return {
    id: String(post._id),
    churchId: String(post.churchId),
    authorType: post.authorType,
    authorId,
    authorName: author?.name,
    authorPhotoUrl: author?.photoUrl,
    content: post.content,
    audience: post.audience,
    audienceRefId: post.audienceRefId ? String(post.audienceRefId) : undefined,
    visibility: post.visibility ?? "public",
    likesCount: post.likesCount,
    commentsCount: post.commentsCount,
    liked,
    viewerFollowsAuthor: isUserAuthor && !isSelf ? followingIds.has(authorId) : undefined,
    viewerFriendshipStatus,
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
  const visibility = data.authorType === "church" ? "public" : data.visibility ?? "public";

  const post = await MuralPost.create({
    churchId: requester.churchId,
    authorType: data.authorType,
    authorId,
    content: data.content,
    audience: data.audience,
    audienceRefId: data.audienceRefId,
    visibility,
  });

  const authorsById = new Map<string, { name: string; photoUrl?: string }>();

  if (data.authorType === "user") {
    const author = await User.findById(requester.sub).select("name photoUrl");
    if (author) {
      authorsById.set(String(author._id), { name: author.name, photoUrl: author.photoUrl ?? undefined });
    }
  }

  return toMuralPostDTO(post, false, requester.sub, authorsById, new Set(), new Map());
}

export async function listMural(
  requester: AuthTokenPayload,
  query: ListMuralQueryDTO,
): Promise<MuralFeedDTO> {
  const filter: Record<string, unknown> = { churchId: requester.churchId };
  const andConditions: Record<string, unknown>[] = [];

  const admin = isAdmin(requester);
  const requesterObjectId = new Types.ObjectId(requester.sub);

  const [followingIds, friendIds] = await Promise.all([
    getFollowingIds(requester.sub),
    getAcceptedFriendIds(requester.sub),
  ]);

  if (!admin) {
    const volunteerMinistries = await MinistryVolunteer.find({
      userId: requester.sub,
      churchId: requester.churchId,
      active: true,
    }).select("ministryId");

    andConditions.push({
      $or: [
        { audience: "all" },
        { audience: "ministry", audienceRefId: { $in: volunteerMinistries.map((v) => v.ministryId) } },
      ],
    });

    const followingOrFriendIds = [...new Set([...followingIds, ...friendIds])].map(
      (id) => new Types.ObjectId(id),
    );
    const friendObjectIds = [...friendIds].map((id) => new Types.ObjectId(id));

    andConditions.push({
      $or: [
        { authorType: "church" },
        { authorType: "user", authorId: requesterObjectId },
        {
          authorType: "user",
          authorId: { $in: followingOrFriendIds },
          visibility: { $ne: "private" },
        },
        { authorType: "user", authorId: { $in: friendObjectIds }, visibility: "private" },
      ],
    });
  }

  if (query.cursor) {
    const { createdAt, id } = decodeCursor(query.cursor);
    andConditions.push({
      $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: new Types.ObjectId(id) } }],
    });
  }

  if (andConditions.length > 0) {
    filter.$and = andConditions;
  }

  const posts = await MuralPost.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1);

  const hasMore = posts.length > query.limit;
  const page = hasMore ? posts.slice(0, query.limit) : posts;

  const userAuthorIds = [...new Set(page.filter((post) => post.authorType === "user").map((post) => String(post.authorId)))];

  const [likes, authorUsers, friendshipMap] = await Promise.all([
    MuralPostLike.find({
      userId: requester.sub,
      postId: { $in: page.map((post) => post._id) },
    }).select("postId"),
    User.find({ _id: { $in: userAuthorIds } }).select("name photoUrl"),
    getFriendshipMap(requester.sub, userAuthorIds),
  ]);

  const likedPostIds = new Set(likes.map((like) => String(like.postId)));
  const authorsById = new Map(
    authorUsers.map((user) => [String(user._id), { name: user.name, photoUrl: user.photoUrl ?? undefined }]),
  );

  return {
    items: page.map((post) =>
      toMuralPostDTO(
        post,
        likedPostIds.has(String(post._id)),
        requester.sub,
        authorsById,
        followingIds,
        friendshipMap,
      ),
    ),
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

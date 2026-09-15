import { Follow } from "../models/Follow.model";
import { User } from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { enqueuePushNotification } from "../jobs/pushNotification.job";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type { CreateFollowDTO, FollowDTO, ListFollowsQueryDTO } from "../interfaces/follow.interface";

type FollowDocumentLike = {
  _id: unknown;
  followerId: unknown;
  followingId: unknown;
  createdAt: Date;
};

function toFollowDTO(follow: FollowDocumentLike): FollowDTO {
  return {
    id: String(follow._id),
    followerId: String(follow.followerId),
    followingId: String(follow.followingId),
    createdAt: follow.createdAt.toISOString(),
  };
}

export async function getFollowingIds(followerId: string): Promise<Set<string>> {
  const follows = await Follow.find({ followerId }).select("followingId");
  return new Set(follows.map((follow) => String(follow.followingId)));
}

export async function createFollow(requester: AuthTokenPayload, data: CreateFollowDTO): Promise<FollowDTO> {
  if (data.followingId === requester.sub) {
    throw new AppError(400, "CANNOT_FOLLOW_SELF", "Não é possível seguir a si mesmo");
  }

  const target = await User.findOne({ _id: data.followingId, churchId: requester.churchId });

  if (!target) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  const existing = await Follow.findOne({ followerId: requester.sub, followingId: data.followingId });

  if (existing) {
    throw new AppError(409, "ALREADY_FOLLOWING", "Você já segue este usuário");
  }

  const follow = await Follow.create({ followerId: requester.sub, followingId: data.followingId });

  await User.findByIdAndUpdate(requester.sub, { $inc: { followingCount: 1 } });
  await User.findByIdAndUpdate(data.followingId, { $inc: { followersCount: 1 } });

  const follower = await User.findById(requester.sub).select("name");

  await enqueuePushNotification({
    userId: data.followingId,
    type: "new_follower",
    title: "Novo seguidor",
    body: `${follower?.name ?? "Alguém"} começou a seguir você.`,
  });

  return toFollowDTO(follow);
}

export async function listFollows(
  requester: AuthTokenPayload,
  type: ListFollowsQueryDTO["type"],
): Promise<FollowDTO[]> {
  const filter = type === "followers" ? { followingId: requester.sub } : { followerId: requester.sub };
  const follows = await Follow.find(filter).sort({ createdAt: -1 });

  return follows.map(toFollowDTO);
}

export async function deleteFollow(requester: AuthTokenPayload, followingId: string): Promise<void> {
  const follow = await Follow.findOneAndDelete({ followerId: requester.sub, followingId });

  if (!follow) {
    throw new AppError(404, "FOLLOW_NOT_FOUND", "Você não segue este usuário");
  }

  await User.findByIdAndUpdate(requester.sub, { $inc: { followingCount: -1 } });
  await User.findByIdAndUpdate(followingId, { $inc: { followersCount: -1 } });
}

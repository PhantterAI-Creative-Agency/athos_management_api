import { Badge } from "../models/Badge.model";
import { User } from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { recalculateUserBadges } from "../jobs/badgeCalculation.job";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type { BadgeDTO, CreateBadgeDTO, UpdateBadgeDTO, UserBadgeDTO } from "../interfaces/badge.interface";

type BadgeLike = {
  _id: unknown;
  key: string;
  name: string;
  iconUrl: string;
  criteria: { type: string; target: number };
};

function toBadgeDTO(badge: BadgeLike): BadgeDTO {
  return {
    id: String(badge._id),
    key: badge.key,
    name: badge.name,
    iconUrl: badge.iconUrl,
    criteria: { type: badge.criteria.type, target: badge.criteria.target },
  };
}

async function findBadgeOrThrow(badgeId: string) {
  const badge = await Badge.findById(badgeId);

  if (!badge) {
    throw new AppError(404, "BADGE_NOT_FOUND", "Medalha não encontrada");
  }

  return badge;
}

export async function createBadge(data: CreateBadgeDTO): Promise<BadgeDTO> {
  const badge = await Badge.create({
    key: data.key,
    name: data.name,
    iconUrl: data.iconUrl,
    criteria: data.criteria,
  });

  return toBadgeDTO(badge);
}

export async function listBadges(): Promise<BadgeDTO[]> {
  const badges = await Badge.find().sort({ _id: 1 });
  return badges.map(toBadgeDTO);
}

export async function updateBadge(badgeId: string, data: UpdateBadgeDTO): Promise<BadgeDTO> {
  const badge = await findBadgeOrThrow(badgeId);

  if (data.key !== undefined) badge.key = data.key;
  if (data.name !== undefined) badge.name = data.name;
  if (data.iconUrl !== undefined) badge.iconUrl = data.iconUrl;
  if (data.criteria !== undefined) badge.criteria = data.criteria;

  await badge.save();

  return toBadgeDTO(badge);
}

export async function deleteBadge(badgeId: string): Promise<void> {
  const badge = await findBadgeOrThrow(badgeId);
  await User.updateMany({ badges: badge._id }, { $pull: { badges: badge._id } });
  await badge.deleteOne();
}

export async function getUserBadges(requester: AuthTokenPayload): Promise<UserBadgeDTO[]> {
  const [badges, progressList] = await Promise.all([
    Badge.find().sort({ _id: 1 }),
    recalculateUserBadges(requester.sub),
  ]);

  const progressByBadgeId = new Map(progressList.map((item) => [String(item.badgeId), item]));

  return badges.map((badge) => {
    const progress = progressByBadgeId.get(String(badge._id));
    return {
      ...toBadgeDTO(badge),
      earned: progress?.earned ?? false,
      progress: progress?.progress ?? 0,
    };
  });
}

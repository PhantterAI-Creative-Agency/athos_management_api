import { Types } from "mongoose";
import { BiblePlan } from "../models/BiblePlan.model";
import { PlanProgress } from "../models/PlanProgress.model";
import { Friendship } from "../models/Friendship.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type {
  CreatePlanDTO,
  ListPlansQueryDTO,
  PlanDetailDTO,
  PlanDTO,
  PlanListItemDTO,
  PlanProgressDTO,
  UpdatePlanDTO,
  UpsertPlanProgressDTO,
} from "../interfaces/plan.interface";

type PlanLike = {
  _id: unknown;
  title: string;
  coverUrl: string;
  durationDays: number;
  themes: string[];
  rating: number;
  source: string;
  createdAt: Date;
};

type PlanProgressLike = {
  _id: unknown;
  userId: unknown;
  planId: unknown;
  status: string;
  currentDay: number;
  totalDays: number;
  completedAt?: Date | null;
  friendsAlsoCompletedIds: unknown[];
  updatedAt: Date;
};

function toPlanDTO(plan: PlanLike): PlanDTO {
  return {
    id: String(plan._id),
    title: plan.title,
    coverUrl: plan.coverUrl,
    durationDays: plan.durationDays,
    themes: plan.themes ?? [],
    rating: plan.rating ?? 0,
    source: plan.source as PlanDTO["source"],
    createdAt: plan.createdAt.toISOString(),
  };
}

function toProgressDTO(progress: PlanProgressLike): PlanProgressDTO {
  return {
    id: String(progress._id),
    userId: String(progress.userId),
    planId: String(progress.planId),
    status: progress.status as PlanProgressDTO["status"],
    currentDay: progress.currentDay ?? 0,
    totalDays: progress.totalDays,
    completedAt: progress.completedAt ? progress.completedAt.toISOString() : undefined,
    friendsAlsoCompletedIds: (progress.friendsAlsoCompletedIds ?? []).map((id) => String(id)),
    updatedAt: progress.updatedAt.toISOString(),
  };
}

async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const friendships = await Friendship.find({
    status: "accepted",
    $or: [{ userId }, { friendId: userId }],
  });

  return friendships.map((friendship) =>
    String(friendship.userId) === userId ? String(friendship.friendId) : String(friendship.userId),
  );
}

async function computeFriendsAlsoCompleted(userId: string, planId: Types.ObjectId): Promise<string[]> {
  const friendIds = await getAcceptedFriendIds(userId);

  if (friendIds.length === 0) return [];

  const completed = await PlanProgress.find({
    planId,
    status: "completed",
    userId: { $in: friendIds },
  }).select("userId");

  return completed.map((progress) => String(progress.userId));
}

async function findPlanScoped(planId: string) {
  const plan = await BiblePlan.findById(planId);

  if (!plan) {
    throw new AppError(404, "PLAN_NOT_FOUND", "Plano não encontrado");
  }

  return plan;
}

export async function createPlan(data: CreatePlanDTO): Promise<PlanDTO> {
  const plan = await BiblePlan.create({
    title: data.title,
    coverUrl: data.coverUrl,
    durationDays: data.durationDays,
    themes: data.themes,
    rating: data.rating,
    source: data.source,
  });

  return toPlanDTO(plan);
}

export async function listPlans(
  requester: AuthTokenPayload,
  query: ListPlansQueryDTO,
): Promise<PlanDTO[] | PlanListItemDTO[]> {
  const tab = query.tab ?? "find";

  if (tab === "find") {
    const plans = await BiblePlan.find().sort({ createdAt: -1 });
    return plans.map(toPlanDTO);
  }

  const statusByTab = { mine: "in_progress", saved: "saved", completed: "completed" } as const;
  const status = statusByTab[tab];

  const progressList = await PlanProgress.find({ userId: requester.sub, status }).populate<{
    planId: PlanLike;
  }>("planId");

  const items = await Promise.all(
    progressList
      .filter((progress) => progress.planId)
      .map(async (progress) => {
        const plan = progress.planId;
        const friendsAlsoCompletedIds = await computeFriendsAlsoCompleted(
          requester.sub,
          plan._id as Types.ObjectId,
        );

        return {
          ...toPlanDTO(plan),
          progress: { ...toProgressDTO(progress), friendsAlsoCompletedIds },
        };
      }),
  );

  return items;
}

export async function getPlan(requester: AuthTokenPayload, planId: string): Promise<PlanDetailDTO> {
  const plan = await findPlanScoped(planId);

  const progress = await PlanProgress.findOne({ userId: requester.sub, planId: plan._id });

  if (!progress) {
    return { ...toPlanDTO(plan), progress: null };
  }

  const friendsAlsoCompletedIds = await computeFriendsAlsoCompleted(requester.sub, plan._id);

  return {
    ...toPlanDTO(plan),
    progress: { ...toProgressDTO(progress), friendsAlsoCompletedIds },
  };
}

export async function updatePlan(planId: string, data: UpdatePlanDTO): Promise<PlanDTO> {
  const plan = await findPlanScoped(planId);

  if (data.title !== undefined) plan.title = data.title;
  if (data.coverUrl !== undefined) plan.coverUrl = data.coverUrl;
  if (data.durationDays !== undefined) plan.durationDays = data.durationDays;
  if (data.themes !== undefined) plan.themes = data.themes;
  if (data.rating !== undefined) plan.rating = data.rating;
  if (data.source !== undefined) plan.source = data.source;

  await plan.save();

  return toPlanDTO(plan);
}

export async function deletePlan(planId: string): Promise<void> {
  const plan = await findPlanScoped(planId);

  await PlanProgress.deleteMany({ planId: plan._id });
  await plan.deleteOne();
}

export async function upsertPlanProgress(
  requester: AuthTokenPayload,
  planId: string,
  data: UpsertPlanProgressDTO,
): Promise<PlanProgressDTO> {
  const plan = await findPlanScoped(planId);

  let progress = await PlanProgress.findOne({ userId: requester.sub, planId: plan._id });

  if (!progress) {
    progress = new PlanProgress({
      userId: new Types.ObjectId(requester.sub),
      planId: plan._id,
      status: data.status ?? "saved",
      currentDay: data.currentDay ?? 0,
      totalDays: plan.durationDays,
    });
  } else {
    if (data.status !== undefined) progress.status = data.status;
    if (data.currentDay !== undefined) progress.currentDay = data.currentDay;
  }

  if (progress.currentDay > progress.totalDays) {
    progress.currentDay = progress.totalDays;
  }

  const isNowComplete = progress.status === "completed" || progress.currentDay >= progress.totalDays;

  if (isNowComplete) {
    progress.status = "completed";
    progress.currentDay = progress.totalDays;
    if (!progress.completedAt) progress.completedAt = new Date();
  } else {
    progress.completedAt = undefined;
  }

  await progress.save();

  return toProgressDTO(progress);
}

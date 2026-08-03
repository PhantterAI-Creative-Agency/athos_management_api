import { GrowthGroup } from "../models/GrowthGroup.model";
import { User } from "../models/User.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type {
  CreateGrowthGroupDTO,
  GrowthGroupDTO,
  UpdateGrowthGroupDTO,
} from "../interfaces/growthGroup.interface";

type PopulatedLeader = { _id: unknown; name: string };

type GrowthGroupDocumentLike = {
  _id: unknown;
  churchId: unknown;
  name: string;
  leaderId: PopulatedLeader | unknown;
  membersIds: unknown[];
  hasPendencies: boolean;
  indicators?: { attendanceRate: number; lastMeetingAt?: Date | null } | null;
  createdAt: Date;
};

function toGrowthGroupDTO(growthGroup: GrowthGroupDocumentLike): GrowthGroupDTO {
  const leader = growthGroup.leaderId;
  const isPopulated = leader !== null && typeof leader === "object" && "_id" in leader;
  const leaderId = isPopulated ? String((leader as PopulatedLeader)._id) : String(leader);
  const leaderName = isPopulated ? (leader as PopulatedLeader).name : "";

  return {
    id: String(growthGroup._id),
    churchId: String(growthGroup.churchId),
    name: growthGroup.name,
    leaderId,
    leaderName,
    membersIds: growthGroup.membersIds.map((memberId) => String(memberId)),
    hasPendencies: growthGroup.hasPendencies,
    indicators: {
      attendanceRate: growthGroup.indicators?.attendanceRate ?? 0,
      lastMeetingAt: growthGroup.indicators?.lastMeetingAt?.toISOString(),
    },
    createdAt: growthGroup.createdAt.toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdmin(requester: AuthTokenPayload): boolean {
  return isDevAdmin(requester) || requester.roles.includes("admin");
}

async function findGrowthGroupScoped(requester: AuthTokenPayload, growthGroupId: string) {
  const growthGroup = await GrowthGroup.findById(growthGroupId).populate("leaderId", "name");

  if (!growthGroup) {
    throw new AppError(404, "GROWTH_GROUP_NOT_FOUND", "Grupo de Crescimento não encontrado");
  }

  if (!isDevAdmin(requester) && String(growthGroup.churchId) !== requester.churchId) {
    throw new AppError(404, "GROWTH_GROUP_NOT_FOUND", "Grupo de Crescimento não encontrado");
  }

  return growthGroup;
}

async function assertUserInChurch(userId: string, churchId: string, errorCode: string): Promise<void> {
  const user = await User.findOne({ _id: userId, churchId });

  if (!user) {
    throw new AppError(404, errorCode, "Usuário não encontrado");
  }
}

export async function createGrowthGroup(
  requester: AuthTokenPayload,
  data: CreateGrowthGroupDTO,
): Promise<GrowthGroupDTO> {
  const churchId = isDevAdmin(requester) && data.churchId ? data.churchId : requester.churchId;

  await assertUserInChurch(data.leaderId, churchId, "LEADER_NOT_FOUND");

  const growthGroup = await GrowthGroup.create({
    churchId,
    name: data.name,
    leaderId: data.leaderId,
    membersIds: data.membersIds ?? [],
    hasPendencies: data.hasPendencies ?? false,
    indicators: {
      attendanceRate: data.indicators?.attendanceRate ?? 0,
      lastMeetingAt: data.indicators?.lastMeetingAt ? new Date(data.indicators.lastMeetingAt) : undefined,
    },
  });

  return toGrowthGroupDTO(growthGroup);
}

export async function listGrowthGroups(requester: AuthTokenPayload, mine?: boolean): Promise<GrowthGroupDTO[]> {
  const filter: Record<string, unknown> = { churchId: requester.churchId };

  if (mine) {
    filter.$or = [{ leaderId: requester.sub }, { membersIds: requester.sub }];
  }

  const growthGroups = await GrowthGroup.find(filter).sort({ name: 1 }).populate("leaderId", "name");

  return growthGroups.map(toGrowthGroupDTO);
}

export async function getGrowthGroup(requester: AuthTokenPayload, growthGroupId: string): Promise<GrowthGroupDTO> {
  const growthGroup = await findGrowthGroupScoped(requester, growthGroupId);

  return toGrowthGroupDTO(growthGroup);
}

export async function updateGrowthGroup(
  requester: AuthTokenPayload,
  growthGroupId: string,
  data: UpdateGrowthGroupDTO,
): Promise<GrowthGroupDTO> {
  const growthGroup = await findGrowthGroupScoped(requester, growthGroupId);

  if (data.name !== undefined) growthGroup.name = data.name;

  if (data.leaderId !== undefined) {
    await assertUserInChurch(data.leaderId, String(growthGroup.churchId), "LEADER_NOT_FOUND");
    growthGroup.leaderId = data.leaderId as unknown as typeof growthGroup.leaderId;
  }

  if (data.membersIds !== undefined) {
    growthGroup.membersIds = data.membersIds as unknown as typeof growthGroup.membersIds;
  }

  if (data.hasPendencies !== undefined) growthGroup.hasPendencies = data.hasPendencies;

  if (data.indicators?.attendanceRate !== undefined || data.indicators?.lastMeetingAt !== undefined) {
    const indicators = growthGroup.indicators ?? { attendanceRate: 0 };

    if (data.indicators?.attendanceRate !== undefined) {
      indicators.attendanceRate = data.indicators.attendanceRate;
    }

    if (data.indicators?.lastMeetingAt !== undefined) {
      indicators.lastMeetingAt = new Date(data.indicators.lastMeetingAt);
    }

    growthGroup.indicators = indicators;
  }

  await growthGroup.save();

  return toGrowthGroupDTO(growthGroup);
}

export async function deleteGrowthGroup(requester: AuthTokenPayload, growthGroupId: string): Promise<void> {
  const growthGroup = await findGrowthGroupScoped(requester, growthGroupId);

  await growthGroup.deleteOne();
}

function assertCanManageMembers(requester: AuthTokenPayload, growthGroup: GrowthGroupDocumentLike): void {
  const leader = growthGroup.leaderId;
  const leaderId =
    leader !== null && typeof leader === "object" && "_id" in leader
      ? String((leader as PopulatedLeader)._id)
      : String(leader);
  const isLeader = leaderId === requester.sub;

  if (!isAdmin(requester) && !isLeader) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Apenas administradores ou o líder deste Grupo de Crescimento podem gerenciar membros",
    );
  }
}

export async function addMember(
  requester: AuthTokenPayload,
  growthGroupId: string,
  userId: string,
): Promise<GrowthGroupDTO> {
  const growthGroup = await findGrowthGroupScoped(requester, growthGroupId);

  assertCanManageMembers(requester, growthGroup);

  await assertUserInChurch(userId, String(growthGroup.churchId), "USER_NOT_FOUND");

  const alreadyMember = growthGroup.membersIds.some((memberId) => String(memberId) === userId);

  if (!alreadyMember) {
    growthGroup.membersIds.push(userId as unknown as (typeof growthGroup.membersIds)[number]);
    await growthGroup.save();
  }

  return toGrowthGroupDTO(growthGroup);
}

export async function removeMember(
  requester: AuthTokenPayload,
  growthGroupId: string,
  userId: string,
): Promise<GrowthGroupDTO> {
  const growthGroup = await findGrowthGroupScoped(requester, growthGroupId);

  assertCanManageMembers(requester, growthGroup);

  growthGroup.membersIds = growthGroup.membersIds.filter(
    (memberId) => String(memberId) !== userId,
  ) as typeof growthGroup.membersIds;

  await growthGroup.save();

  return toGrowthGroupDTO(growthGroup);
}

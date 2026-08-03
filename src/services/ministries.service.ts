import { Ministry } from "../models/Ministry.model";
import { MinistryVolunteer } from "../models/MinistryVolunteer.model";
import { User } from "../models/User.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type {
  AddVolunteerDTO,
  CreateMinistryDTO,
  MinistryDTO,
  MinistryVolunteerDTO,
  UpdateMinistryDTO,
} from "../interfaces/ministry.interface";

type MinistryDocumentLike = {
  _id: unknown;
  churchId: unknown;
  name: string;
  iconUrl?: string | null;
  contractRequired: boolean;
  participantsCount: number;
  createdAt: Date;
};

type MinistryVolunteerDocumentLike = {
  _id: unknown;
  ministryId: unknown;
  userId: unknown;
  role?: string | null;
  contractSigned: boolean;
  active: boolean;
  joinedAt: Date;
};

function toMinistryDTO(ministry: MinistryDocumentLike, isVolunteer: boolean): MinistryDTO {
  return {
    id: String(ministry._id),
    churchId: String(ministry.churchId),
    name: ministry.name,
    iconUrl: ministry.iconUrl ?? undefined,
    contractRequired: ministry.contractRequired,
    participantsCount: ministry.participantsCount,
    isVolunteer,
    createdAt: ministry.createdAt.toISOString(),
  };
}

function toVolunteerDTO(volunteer: MinistryVolunteerDocumentLike): MinistryVolunteerDTO {
  return {
    id: String(volunteer._id),
    ministryId: String(volunteer.ministryId),
    userId: String(volunteer.userId),
    role: volunteer.role ?? undefined,
    contractSigned: volunteer.contractSigned,
    active: volunteer.active,
    joinedAt: volunteer.joinedAt.toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdmin(requester: AuthTokenPayload): boolean {
  return isDevAdmin(requester) || requester.roles.includes("admin");
}

async function findMinistryScoped(requester: AuthTokenPayload, ministryId: string) {
  const ministry = await Ministry.findById(ministryId);

  if (!ministry) {
    throw new AppError(404, "MINISTRY_NOT_FOUND", "Ministério não encontrado");
  }

  if (!isDevAdmin(requester) && String(ministry.churchId) !== requester.churchId) {
    throw new AppError(404, "MINISTRY_NOT_FOUND", "Ministério não encontrado");
  }

  return ministry;
}

export async function createMinistry(requester: AuthTokenPayload, data: CreateMinistryDTO): Promise<MinistryDTO> {
  const churchId = isDevAdmin(requester) && data.churchId ? data.churchId : requester.churchId;

  const ministry = await Ministry.create({
    churchId,
    name: data.name,
    iconUrl: data.iconUrl,
    contractRequired: data.contractRequired ?? false,
  });

  return toMinistryDTO(ministry, false);
}

export async function listMinistries(requester: AuthTokenPayload, highlightUserId?: string): Promise<MinistryDTO[]> {
  const targetUserId = highlightUserId ?? requester.sub;

  const ministries = await Ministry.find({ churchId: requester.churchId }).sort({ name: 1 });

  const activeVolunteerRecords = await MinistryVolunteer.find({
    userId: targetUserId,
    churchId: requester.churchId,
    active: true,
  }).select("ministryId");

  const volunteerMinistryIds = new Set(activeVolunteerRecords.map((record) => String(record.ministryId)));

  const dtos = ministries.map((ministry) => toMinistryDTO(ministry, volunteerMinistryIds.has(String(ministry._id))));

  return [...dtos.filter((ministry) => ministry.isVolunteer), ...dtos.filter((ministry) => !ministry.isVolunteer)];
}

export async function getMinistry(requester: AuthTokenPayload, ministryId: string): Promise<MinistryDTO> {
  const ministry = await findMinistryScoped(requester, ministryId);

  const isVolunteer = await MinistryVolunteer.exists({
    ministryId,
    userId: requester.sub,
    churchId: ministry.churchId,
    active: true,
  });

  return toMinistryDTO(ministry, Boolean(isVolunteer));
}

export async function updateMinistry(
  requester: AuthTokenPayload,
  ministryId: string,
  data: UpdateMinistryDTO,
): Promise<MinistryDTO> {
  const ministry = await findMinistryScoped(requester, ministryId);

  if (data.name !== undefined) ministry.name = data.name;
  if (data.iconUrl !== undefined) ministry.iconUrl = data.iconUrl;
  if (data.contractRequired !== undefined) ministry.contractRequired = data.contractRequired;

  await ministry.save();

  const isVolunteer = await MinistryVolunteer.exists({
    ministryId,
    userId: requester.sub,
    churchId: ministry.churchId,
    active: true,
  });

  return toMinistryDTO(ministry, Boolean(isVolunteer));
}

export async function deleteMinistry(requester: AuthTokenPayload, ministryId: string): Promise<void> {
  const ministry = await findMinistryScoped(requester, ministryId);

  await MinistryVolunteer.deleteMany({ ministryId: ministry._id });
  await ministry.deleteOne();
}

export async function addVolunteer(
  requester: AuthTokenPayload,
  ministryId: string,
  data: AddVolunteerDTO,
): Promise<MinistryVolunteerDTO> {
  const ministry = await findMinistryScoped(requester, ministryId);
  const churchId = String(ministry.churchId);

  const targetUserId = data.userId ?? requester.sub;
  const isSelf = targetUserId === requester.sub;

  if (!isSelf) {
    const isMinistryLeader = await MinistryVolunteer.exists({
      ministryId,
      userId: requester.sub,
      role: "leader",
      active: true,
    });

    if (!isAdmin(requester) && !isMinistryLeader) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Apenas administradores ou o líder deste ministério podem adicionar outros voluntários",
      );
    }
  }

  const targetUser = await User.findOne({ _id: targetUserId, churchId });

  if (!targetUser) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  const existing = await MinistryVolunteer.findOne({ ministryId, userId: targetUserId });
  const wasActive = existing?.active ?? false;

  const volunteer =
    existing ??
    new MinistryVolunteer({
      ministryId,
      userId: targetUserId,
      churchId,
    });

  volunteer.active = true;
  if (data.role !== undefined) volunteer.role = data.role;

  await volunteer.save();

  if (!wasActive) {
    ministry.participantsCount += 1;
    await ministry.save();
  }

  return toVolunteerDTO(volunteer);
}

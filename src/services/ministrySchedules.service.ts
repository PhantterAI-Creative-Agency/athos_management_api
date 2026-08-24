import { Ministry } from "../models/Ministry.model";
import { MinistrySchedule } from "../models/MinistrySchedule.model";
import { MinistryVolunteer } from "../models/MinistryVolunteer.model";
import { User } from "../models/User.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import { isMinistryLeaderUser } from "./ministries.service";
import type {
  CreateScheduleDTO,
  MinistryScheduleDTO,
  UpdateScheduleDTO,
} from "../interfaces/ministrySchedule.interface";

type PopulatedLeader = { _id: unknown };

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

function assertCanManageSchedule(
  requester: AuthTokenPayload,
  ministry: { leader?: PopulatedLeader | unknown },
): void {
  if (isAdmin(requester) || isMinistryLeaderUser(requester, ministry)) return;

  throw new AppError(
    403,
    "FORBIDDEN",
    "Apenas administradores ou o líder deste ministério podem gerenciar escalas",
  );
}

async function findScheduleScoped(requester: AuthTokenPayload, ministryId: string, scheduleId: string) {
  const schedule = await MinistrySchedule.findOne({ _id: scheduleId, ministryId });

  if (!schedule) {
    throw new AppError(404, "SCHEDULE_NOT_FOUND", "Escala não encontrada");
  }

  if (!isDevAdmin(requester) && String(schedule.churchId) !== requester.churchId) {
    throw new AppError(404, "SCHEDULE_NOT_FOUND", "Escala não encontrada");
  }

  return schedule;
}

async function buildAssignments(
  ministry: Awaited<ReturnType<typeof findMinistryScoped>>,
  assignments: CreateScheduleDTO["assignments"],
) {
  const functionsById = new Map(ministry.serviceFunctions.map((item) => [String(item._id), item]));

  const activeVolunteerIds = new Set(
    (
      await MinistryVolunteer.find({ ministryId: ministry._id, active: true }).select("userId")
    ).map((record) => String(record.userId)),
  );

  return assignments.map((assignment) => {
    const fn = functionsById.get(assignment.functionId);

    if (!fn) {
      throw new AppError(400, "INVALID_FUNCTION", "Função de escala inválida para este ministério");
    }

    for (const volunteerId of assignment.volunteerIds) {
      if (!activeVolunteerIds.has(volunteerId)) {
        throw new AppError(
          400,
          "INVALID_VOLUNTEER",
          "Um dos voluntários informados não é voluntário ativo deste ministério",
        );
      }
    }

    return {
      functionId: fn._id,
      functionName: fn.name,
      volunteerIds: assignment.volunteerIds,
    };
  });
}

async function toScheduleDTO(schedule: {
  _id: unknown;
  ministryId: unknown;
  churchId: unknown;
  date: Date;
  title?: string | null;
  notes?: string | null;
  assignments: { functionId: unknown; functionName: string; volunteerIds: unknown[] }[];
  createdBy: unknown;
  createdAt: Date;
  updatedAt: Date;
}): Promise<MinistryScheduleDTO> {
  const volunteerIds = [
    ...new Set(schedule.assignments.flatMap((assignment) => assignment.volunteerIds.map(String))),
  ];

  const volunteers = await User.find({ _id: { $in: volunteerIds } }).select("name");
  const nameById = new Map(volunteers.map((user) => [String(user._id), user.name]));

  return {
    id: String(schedule._id),
    ministryId: String(schedule.ministryId),
    churchId: String(schedule.churchId),
    date: schedule.date.toISOString(),
    title: schedule.title ?? undefined,
    notes: schedule.notes ?? undefined,
    assignments: schedule.assignments.map((assignment) => ({
      functionId: String(assignment.functionId),
      functionName: assignment.functionName,
      volunteerIds: assignment.volunteerIds.map(String),
      volunteerNames: assignment.volunteerIds.map((id) => nameById.get(String(id)) ?? "Usuário removido"),
    })),
    createdBy: String(schedule.createdBy),
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

export async function listSchedules(
  requester: AuthTokenPayload,
  ministryId: string,
  range: { from?: string; to?: string },
): Promise<MinistryScheduleDTO[]> {
  await findMinistryScoped(requester, ministryId);

  const dateFilter: Record<string, Date> = {};
  if (range.from) dateFilter.$gte = new Date(range.from);
  if (range.to) dateFilter.$lte = new Date(range.to);

  const schedules = await MinistrySchedule.find({
    ministryId,
    ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
  }).sort({ date: 1 });

  return Promise.all(schedules.map(toScheduleDTO));
}

export async function getSchedule(
  requester: AuthTokenPayload,
  ministryId: string,
  scheduleId: string,
): Promise<MinistryScheduleDTO> {
  await findMinistryScoped(requester, ministryId);
  const schedule = await findScheduleScoped(requester, ministryId, scheduleId);

  return toScheduleDTO(schedule);
}

export async function createSchedule(
  requester: AuthTokenPayload,
  ministryId: string,
  data: CreateScheduleDTO,
): Promise<MinistryScheduleDTO> {
  const ministry = await findMinistryScoped(requester, ministryId);
  assertCanManageSchedule(requester, ministry);

  const assignments = await buildAssignments(ministry, data.assignments);

  const schedule = await MinistrySchedule.create({
    churchId: ministry.churchId,
    ministryId: ministry._id,
    date: data.date,
    title: data.title,
    notes: data.notes,
    assignments,
    createdBy: requester.sub,
  });

  return toScheduleDTO(schedule);
}

export async function updateSchedule(
  requester: AuthTokenPayload,
  ministryId: string,
  scheduleId: string,
  data: UpdateScheduleDTO,
): Promise<MinistryScheduleDTO> {
  const ministry = await findMinistryScoped(requester, ministryId);
  assertCanManageSchedule(requester, ministry);
  const schedule = await findScheduleScoped(requester, ministryId, scheduleId);

  if (data.date !== undefined) schedule.date = data.date;
  if (data.title !== undefined) schedule.title = data.title;
  if (data.notes !== undefined) schedule.notes = data.notes;
  if (data.assignments !== undefined) {
    schedule.set("assignments", await buildAssignments(ministry, data.assignments));
  }

  await schedule.save();

  return toScheduleDTO(schedule);
}

export async function deleteSchedule(
  requester: AuthTokenPayload,
  ministryId: string,
  scheduleId: string,
): Promise<void> {
  const ministry = await findMinistryScoped(requester, ministryId);
  assertCanManageSchedule(requester, ministry);
  const schedule = await findScheduleScoped(requester, ministryId, scheduleId);

  await schedule.deleteOne();
}

import { CheckinLog } from "../models/CheckinLog.model";
import { Event } from "../models/Event.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { signCheckinToken, verifyCheckinToken } from "../helpers/qrToken.helper";
import { AppError } from "../middlewares/errorHandler";
import type {
  CheckinLogDTO,
  CheckinTokenDTO,
  ListCheckinQueryDTO,
  RegisterCheckinDTO,
} from "../interfaces/checkin.interface";

type CheckinLogDocumentLike = {
  _id: unknown;
  churchId: unknown;
  userId: unknown;
  eventId?: unknown;
  checkedInBy: unknown;
  checkedInAt: Date;
  createdAt: Date;
};

function toCheckinLogDTO(log: CheckinLogDocumentLike): CheckinLogDTO {
  return {
    id: String(log._id),
    churchId: String(log.churchId),
    userId: String(log.userId),
    eventId: log.eventId ? String(log.eventId) : undefined,
    checkedInBy: String(log.checkedInBy),
    checkedInAt: log.checkedInAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.some((role) => role === "admin" || role === "devAdmin");
}

async function assertEventInChurch(eventId: string, churchId: string): Promise<void> {
  const event = await Event.findById(eventId);

  if (!event || String(event.churchId) !== churchId) {
    throw new AppError(404, "EVENT_NOT_FOUND", "Evento não encontrado");
  }
}

export async function generateCheckinToken(
  requester: AuthTokenPayload,
  eventId?: string,
): Promise<CheckinTokenDTO> {
  if (eventId) {
    await assertEventInChurch(eventId, requester.churchId);
  }

  const { token, expiresAt } = signCheckinToken(requester.sub, requester.churchId, eventId);

  return { token, expiresAt };
}

export async function registerCheckin(
  requester: AuthTokenPayload,
  data: RegisterCheckinDTO,
): Promise<CheckinLogDTO> {
  let payload;

  try {
    payload = verifyCheckinToken(data.token);
  } catch {
    throw new AppError(400, "CHECKIN_TOKEN_INVALID", "Token de check-in inválido ou expirado");
  }

  if (!isDevAdmin(requester) && payload.churchId !== requester.churchId) {
    throw new AppError(404, "CHECKIN_TOKEN_INVALID", "Token de check-in inválido ou expirado");
  }

  if (payload.eventId) {
    await assertEventInChurch(payload.eventId, payload.churchId);
  }

  const existing = await CheckinLog.findOne({ tokenId: payload.jti });

  if (existing) {
    throw new AppError(409, "CHECKIN_ALREADY_USED", "Este QR Code já foi utilizado");
  }

  const log = await CheckinLog.create({
    churchId: payload.churchId,
    userId: payload.sub,
    eventId: payload.eventId,
    checkedInBy: requester.sub,
    tokenId: payload.jti,
    checkedInAt: new Date(),
  });

  return toCheckinLogDTO(log);
}

export async function listCheckins(
  requester: AuthTokenPayload,
  query: ListCheckinQueryDTO,
): Promise<CheckinLogDTO[]> {
  const filter: Record<string, unknown> = { churchId: requester.churchId };

  if (isAdmin(requester)) {
    if (query.userId) {
      filter.userId = query.userId;
    }
  } else {
    filter.userId = requester.sub;
  }

  if (query.eventId) {
    filter.eventId = query.eventId;
  }

  const logs = await CheckinLog.find(filter).sort({ checkedInAt: -1 });

  return logs.map(toCheckinLogDTO);
}

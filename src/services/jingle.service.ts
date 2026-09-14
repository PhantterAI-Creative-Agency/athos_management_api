import { Jingle } from "../models/Jingle.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type { CreateJingleDTO, JingleDTO, UpdateJingleDTO } from "../interfaces/jingle.interface";

type JingleDocumentLike = {
  _id: unknown;
  churchId: unknown;
  title: string;
  url: string;
  active: boolean;
  order: number;
  createdAt?: Date;
};

function toJingleDTO(jingle: JingleDocumentLike): JingleDTO {
  return {
    id: String(jingle._id),
    churchId: String(jingle.churchId),
    title: jingle.title,
    url: jingle.url,
    active: jingle.active,
    order: jingle.order,
    createdAt: jingle.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

async function findJingleScoped(requester: AuthTokenPayload, jingleId: string) {
  const jingle = await Jingle.findById(jingleId);

  if (!jingle) {
    throw new AppError(404, "JINGLE_NOT_FOUND", "Vinheta não encontrada");
  }

  if (!isDevAdmin(requester) && String(jingle.churchId) !== requester.churchId) {
    throw new AppError(404, "JINGLE_NOT_FOUND", "Vinheta não encontrada");
  }

  return jingle;
}

export async function createJingle(requester: AuthTokenPayload, data: CreateJingleDTO): Promise<JingleDTO> {
  const churchId = isDevAdmin(requester) && data.churchId ? data.churchId : requester.churchId;

  const jingle = await Jingle.create({
    churchId,
    title: data.title,
    url: data.url,
    active: data.active ?? true,
    order: data.order ?? 0,
  });

  return toJingleDTO(jingle);
}

export async function listJingles(requester: AuthTokenPayload): Promise<JingleDTO[]> {
  const jingles = await Jingle.find({ churchId: requester.churchId }).sort({ order: 1, createdAt: 1 });

  return jingles.map(toJingleDTO);
}

export async function listJinglesPublic(churchId: string): Promise<JingleDTO[]> {
  const jingles = await Jingle.find({ churchId, active: true }).sort({ order: 1, createdAt: 1 });

  return jingles.map(toJingleDTO);
}

export async function getJingle(requester: AuthTokenPayload, jingleId: string): Promise<JingleDTO> {
  const jingle = await findJingleScoped(requester, jingleId);

  return toJingleDTO(jingle);
}

export async function updateJingle(
  requester: AuthTokenPayload,
  jingleId: string,
  data: UpdateJingleDTO,
): Promise<JingleDTO> {
  const jingle = await findJingleScoped(requester, jingleId);

  if (data.title !== undefined) jingle.title = data.title;
  if (data.url !== undefined) jingle.url = data.url;
  if (data.active !== undefined) jingle.active = data.active;
  if (data.order !== undefined) jingle.order = data.order;

  await jingle.save();

  return toJingleDTO(jingle);
}

export async function deleteJingle(requester: AuthTokenPayload, jingleId: string): Promise<void> {
  const jingle = await findJingleScoped(requester, jingleId);

  await jingle.deleteOne();
}

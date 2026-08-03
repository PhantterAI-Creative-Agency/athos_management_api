import { Devotional } from "../models/Devotional.model";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type { CreateDevotionalDTO, DevotionalDTO, UpdateDevotionalDTO } from "../interfaces/devotional.interface";

type DevotionalDocumentLike = {
  _id: unknown;
  churchId: unknown;
  title: string;
  content: string;
  publishedAt: Date;
  createdAt: Date;
};

function toDevotionalDTO(devotional: DevotionalDocumentLike): DevotionalDTO {
  return {
    id: String(devotional._id),
    churchId: String(devotional.churchId),
    title: devotional.title,
    content: devotional.content,
    publishedAt: devotional.publishedAt.toISOString(),
    createdAt: devotional.createdAt.toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

async function findDevotionalScoped(requester: AuthTokenPayload, devotionalId: string) {
  const devotional = await Devotional.findById(devotionalId);

  if (!devotional) {
    throw new AppError(404, "DEVOTIONAL_NOT_FOUND", "Devocional não encontrado");
  }

  if (!isDevAdmin(requester) && String(devotional.churchId) !== requester.churchId) {
    throw new AppError(404, "DEVOTIONAL_NOT_FOUND", "Devocional não encontrado");
  }

  return devotional;
}

export async function createDevotional(
  requester: AuthTokenPayload,
  data: CreateDevotionalDTO,
): Promise<DevotionalDTO> {
  const churchId = isDevAdmin(requester) && data.churchId ? data.churchId : requester.churchId;

  const devotional = await Devotional.create({
    churchId,
    title: data.title,
    content: data.content,
    publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
  });

  return toDevotionalDTO(devotional);
}

export async function listDevotionals(requester: AuthTokenPayload): Promise<DevotionalDTO[]> {
  const devotionals = await Devotional.find({ churchId: requester.churchId }).sort({ publishedAt: -1 });

  return devotionals.map(toDevotionalDTO);
}

export async function listDevotionalsPublic(churchId: string): Promise<DevotionalDTO[]> {
  const devotionals = await Devotional.find({ churchId }).sort({ publishedAt: -1 }).limit(5);

  return devotionals.map(toDevotionalDTO);
}

export async function getDevotional(requester: AuthTokenPayload, devotionalId: string): Promise<DevotionalDTO> {
  const devotional = await findDevotionalScoped(requester, devotionalId);

  return toDevotionalDTO(devotional);
}

export async function updateDevotional(
  requester: AuthTokenPayload,
  devotionalId: string,
  data: UpdateDevotionalDTO,
): Promise<DevotionalDTO> {
  const devotional = await findDevotionalScoped(requester, devotionalId);

  if (data.title !== undefined) devotional.title = data.title;
  if (data.content !== undefined) devotional.content = data.content;
  if (data.publishedAt !== undefined) devotional.publishedAt = new Date(data.publishedAt);

  await devotional.save();

  return toDevotionalDTO(devotional);
}

export async function deleteDevotional(requester: AuthTokenPayload, devotionalId: string): Promise<void> {
  const devotional = await findDevotionalScoped(requester, devotionalId);

  await devotional.deleteOne();
}

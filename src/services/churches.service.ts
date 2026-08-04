import { Types } from "mongoose";
import { Church } from "../models/Church.model";
import { AppError } from "../middlewares/errorHandler";
import type {
  ChurchDTO,
  ChurchSearchResultDTO,
  RegisterChurchDTO,
  UpdateChurchDTO,
} from "../interfaces/church.interface";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(new RegExp("[\u0300-\u036f]", "g"), "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toChurchDTO(church: {
  _id: unknown;
  name: string;
  logoUrl: string;
  address?: string | null;
  phone?: string | null;
  about?: string | null;
  slug: string;
  settings?: {
    primaryColor: string;
    growthGroupName?: string;
    growthGroupAcronym?: string;
  } | null;
  homeContent?: {
    intro?: string | null;
    mission?: string | null;
    vision?: string | null;
    values?: string | null;
    bannerEventId?: unknown;
  } | null;
  contact?: { email?: string | null; whatsapp?: string | null } | null;
  socialLinks?: { facebook?: string | null; instagram?: string | null; youtube?: string | null } | null;
  serviceSchedule?: { day: string; time: string; theme: string }[] | null;
  createdAt: Date;
}): ChurchDTO {
  return {
    id: String(church._id),
    name: church.name,
    logoUrl: church.logoUrl,
    address: church.address ?? undefined,
    phone: church.phone ?? undefined,
    about: church.about ?? undefined,
    slug: church.slug,
    settings: {
      primaryColor: church.settings?.primaryColor ?? "#000000",
      growthGroupName: church.settings?.growthGroupName ?? "Grupos de Crescimento",
      growthGroupAcronym: church.settings?.growthGroupAcronym ?? "GC",
    },
    homeContent: church.homeContent
      ? {
          intro: church.homeContent.intro ?? undefined,
          mission: church.homeContent.mission ?? undefined,
          vision: church.homeContent.vision ?? undefined,
          values: church.homeContent.values ?? undefined,
          bannerEventId: church.homeContent.bannerEventId
            ? String(church.homeContent.bannerEventId)
            : undefined,
        }
      : undefined,
    contact: church.contact
      ? { email: church.contact.email ?? undefined, whatsapp: church.contact.whatsapp ?? undefined }
      : undefined,
    socialLinks: church.socialLinks
      ? {
          facebook: church.socialLinks.facebook ?? undefined,
          instagram: church.socialLinks.instagram ?? undefined,
          youtube: church.socialLinks.youtube ?? undefined,
        }
      : undefined,
    serviceSchedule: church.serviceSchedule ?? undefined,
    createdAt: church.createdAt.toISOString(),
  };
}

export async function getChurch(churchId: string): Promise<ChurchDTO> {
  const church = await Church.findById(churchId);

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  return toChurchDTO(church);
}

export async function getChurchBySlug(slug: string): Promise<ChurchDTO> {
  const church = await Church.findOne({ slug });

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  return toChurchDTO(church);
}

export async function searchChurches(q: string): Promise<ChurchSearchResultDTO[]> {
  const pattern = new RegExp(escapeRegex(q), "i");

  const churches = await Church.find({
    $or: [{ name: pattern }, { slug: pattern }],
  }).limit(20);

  return churches.map((church) => ({
    name: church.name,
    logoUrl: church.logoUrl,
    slug: church.slug,
    address: church.address ?? undefined,
  }));
}

export async function registerChurch(data: RegisterChurchDTO): Promise<ChurchDTO> {
  const baseSlug = slugify(data.slug ?? data.name);

  if (!baseSlug) {
    throw new AppError(400, "INVALID_SLUG", "Não foi possível gerar um slug válido a partir do nome informado");
  }

  const existing = await Church.findOne({ slug: baseSlug });

  if (existing) {
    throw new AppError(409, "SLUG_ALREADY_EXISTS", "Já existe uma igreja cadastrada com este slug");
  }

  const church = await Church.create({
    name: data.name,
    logoUrl: data.logoUrl,
    address: data.address,
    slug: baseSlug,
  });

  return toChurchDTO(church);
}

export async function updateChurch(churchId: string, data: UpdateChurchDTO): Promise<ChurchDTO> {
  const church = await Church.findById(churchId);

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  if (data.name !== undefined) church.name = data.name;
  if (data.logoUrl !== undefined) church.logoUrl = data.logoUrl;
  if (data.address !== undefined) church.address = data.address;
  if (data.phone !== undefined) church.phone = data.phone;
  if (data.about !== undefined) church.about = data.about;
  if (data.settings !== undefined) {
    church.settings = {
      primaryColor: data.settings.primaryColor ?? church.settings?.primaryColor ?? "#000000",
      growthGroupName: data.settings.growthGroupName ?? church.settings?.growthGroupName ?? "Grupos de Crescimento",
      growthGroupAcronym: data.settings.growthGroupAcronym ?? church.settings?.growthGroupAcronym ?? "GC",
    };
  }
  if (data.homeContent !== undefined) {
    const { bannerEventId, ...rest } = data.homeContent;
    church.homeContent = {
      ...church.homeContent,
      ...rest,
      ...(bannerEventId !== undefined ? { bannerEventId: new Types.ObjectId(bannerEventId) } : {}),
    };
  }
  if (data.contact !== undefined) {
    church.contact = { ...church.contact, ...data.contact };
  }
  if (data.socialLinks !== undefined) {
    church.socialLinks = { ...church.socialLinks, ...data.socialLinks };
  }
  if (data.serviceSchedule !== undefined) {
    church.set("serviceSchedule", data.serviceSchedule);
  }

  await church.save();

  return toChurchDTO(church);
}

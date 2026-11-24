import { Types } from "mongoose";
import { Church } from "../models/Church.model";
import { AppError } from "../middlewares/errorHandler";
import {
  CHURCH_FEATURES,
  featureSettingsPath,
  resolveFeatures,
  type ChurchFeature,
  type ChurchFeatureSettings,
} from "../helpers/features.helper";
import type {
  ChurchDTO,
  FooterWidgetDTO,
  FooterWidgetItemType,
  ChurchSearchResultDTO,
  RegisterChurchDTO,
  UpdateChurchDTO,
  UpdateChurchFeaturesDTO,
  UpdateChurchThemeDTO,
} from "../interfaces/church.interface";
import { hasActiveAcceptance } from "./legal.service";
import { normalizeHost, resolveTheme, type ThemeSettings } from "../helpers/theme.helper";

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
  addressDetails?: {
    cep?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
  } | null;
  phone?: string | null;
  about?: string | null;
  slug: string;
  settings?: {
    primaryColor: string;
    growthGroupName?: string;
    growthGroupAcronym?: string;
    adsEnabled?: boolean;
    disabledAdPlacements?: string[];
    features?: ChurchFeatureSettings | null;
    theme?: ThemeSettings | null;
  } | null;
  domains?: string[] | null;
  homeContent?: {
    intro?: string | null;
    mission?: string | null;
    vision?: string | null;
    values?: string | null;
    bannerEventId?: unknown;
  } | null;
  contact?: {
    email?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    socialLinks?: { platform: string; url: string }[] | null;
  } | null;
  socialLinks?: { facebook?: string | null; instagram?: string | null; youtube?: string | null } | null;
  serviceSchedule?: { day: string; time: string; theme: string }[] | null;
  footerWidgets?:
    | {
        title?: string | null;
        items?:
          | {
              type: string;
              text?: string | null;
              url?: string | null;
              imageUrl?: string | null;
              icon?: string | null;
            }[]
          | null;
      }[]
    | null;
  createdAt: Date;
}): ChurchDTO {
  return {
    id: String(church._id),
    name: church.name,
    logoUrl: church.logoUrl,
    address: church.address ?? undefined,
    addressDetails: church.addressDetails?.cep
      ? {
          cep: church.addressDetails.cep,
          street: church.addressDetails.street ?? "",
          number: church.addressDetails.number ?? "",
          complement: church.addressDetails.complement ?? undefined,
          neighborhood: church.addressDetails.neighborhood ?? undefined,
          city: church.addressDetails.city ?? undefined,
          state: church.addressDetails.state ?? undefined,
        }
      : undefined,
    phone: church.phone ?? undefined,
    about: church.about ?? undefined,
    slug: church.slug,
    settings: {
      primaryColor: church.settings?.primaryColor ?? "#000000",
      growthGroupName: church.settings?.growthGroupName ?? "Grupos de Crescimento",
      growthGroupAcronym: church.settings?.growthGroupAcronym ?? "GC",
      adsEnabled: church.settings?.adsEnabled ?? true,
      disabledAdPlacements: church.settings?.disabledAdPlacements ?? [],
      features: resolveFeatures(church.settings),
      theme: resolveTheme(church.settings?.theme),
    },
    domains: church.domains ?? [],
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
      ? {
          email: church.contact.email ?? undefined,
          whatsapp: church.contact.whatsapp ?? undefined,
          phone: church.contact.phone ?? undefined,
          socialLinks: (church.contact.socialLinks ?? []).map((l) => ({ platform: l.platform, url: l.url })),
        }
      : undefined,
    socialLinks: church.socialLinks
      ? {
          facebook: church.socialLinks.facebook ?? undefined,
          instagram: church.socialLinks.instagram ?? undefined,
          youtube: church.socialLinks.youtube ?? undefined,
        }
      : undefined,
    serviceSchedule: church.serviceSchedule ?? undefined,
    footerWidgets: church.footerWidgets
      ? church.footerWidgets.map(
          (widget): FooterWidgetDTO => ({
            title: widget.title ?? "",
            items: (widget.items ?? []).map((item) => ({
              type: item.type as FooterWidgetItemType,
              text: item.text ?? undefined,
              url: item.url ?? undefined,
              imageUrl: item.imageUrl ?? undefined,
              icon: item.icon ?? undefined,
            })),
          }),
        )
      : undefined,
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

export async function getChurchForUser(churchId: string, slug: string): Promise<ChurchDTO> {
  const church = await Church.findById(churchId);

  if (!church || church.slug !== slug) {
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

export async function updateChurch(
  churchId: string,
  data: UpdateChurchDTO,
  slug?: string,
): Promise<ChurchDTO> {
  const church = await Church.findById(churchId);

  if (!church || (slug !== undefined && church.slug !== slug)) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  if (data.name !== undefined) church.name = data.name;
  if (data.logoUrl !== undefined) church.logoUrl = data.logoUrl;
  if (data.address !== undefined) church.address = data.address;
  if (data.addressDetails !== undefined) church.set("addressDetails", data.addressDetails);
  if (data.phone !== undefined) church.phone = data.phone;
  if (data.about !== undefined) church.about = data.about;
  if (data.settings !== undefined) {
    // Campo a campo: atribuir `church.settings` inteiro apagaria as demais configurações
    // (youtubeChannelId, feature flags...).
    for (const [key, value] of Object.entries(data.settings)) {
      if (value !== undefined) church.set(`settings.${key}`, value);
    }
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
    for (const [key, value] of Object.entries(data.contact)) {
      if (value !== undefined) church.set(`contact.${key}`, value);
    }
  }
  if (data.socialLinks !== undefined) {
    church.socialLinks = { ...church.socialLinks, ...data.socialLinks };
  }
  if (data.serviceSchedule !== undefined) {
    church.set("serviceSchedule", data.serviceSchedule);
  }
  if (data.footerWidgets !== undefined) {
    church.set("footerWidgets", data.footerWidgets);
  }

  await church.save();

  return toChurchDTO(church);
}

export async function getChurchFeatures(churchId: string): Promise<Record<ChurchFeature, boolean>> {
  const church = await Church.findById(churchId).select("settings").lean();

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  return resolveFeatures(church.settings);
}

export async function updateChurchFeatures(
  churchId: string,
  data: UpdateChurchFeaturesDTO,
): Promise<Record<ChurchFeature, boolean>> {
  const church = await Church.findById(churchId);

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  // A rádio só liga com o aceite vigente do termo de responsabilidade (direitos autorais/ECAD).
  if (data.radio === true && !resolveFeatures(church.settings).radio) {
    const accepted = await hasActiveAcceptance({ type: "radio_liability", churchId });
    if (!accepted) {
      throw new AppError(
        422,
        "FEATURE_REQUIRES_ACCEPTANCE",
        "Para ativar a rádio, o administrador precisa aceitar o termo de responsabilidade sobre direitos autorais",
      );
    }
  }

  for (const feature of CHURCH_FEATURES) {
    const value = data[feature];
    if (value !== undefined) church.set(featureSettingsPath(feature), value);
  }

  await church.save();

  return resolveFeatures(church.settings);
}

export async function updateChurchTheme(churchId: string, data: UpdateChurchThemeDTO): Promise<ChurchDTO> {
  const church = await Church.findById(churchId);

  if (!church) {
    throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  }

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value === null) church.set(`settings.theme.${key}`, undefined);
    else church.set(`settings.theme.${key}`, value);
  }
  await church.save();

  return toChurchDTO(church);
}

/** Igreja dona de um domínio (site multi-igreja: a igreja é descoberta pelo endereço). */
export async function findChurchByHost(host: string): Promise<{ slug: string; name: string } | null> {
  const church = await Church.findOne({ domains: normalizeHost(host) }).select("slug name").lean();
  return church ? { slug: church.slug, name: church.name } : null;
}

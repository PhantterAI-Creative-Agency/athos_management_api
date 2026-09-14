import { Ad } from "../models/Ad.model";
import { AppError } from "../middlewares/errorHandler";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type { AdDTO, CreateAdDTO, UpdateAdDTO } from "../interfaces/ad.interface";

type AdDocumentLike = {
  _id: unknown;
  churchId: unknown;
  format: "card" | "slide";
  placement: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  active: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
  order: number;
  clicks: number;
  impressions: number;
  createdAt?: Date;
};

function toAdDTO(ad: AdDocumentLike): AdDTO {
  return {
    id: String(ad._id),
    churchId: String(ad.churchId),
    format: ad.format,
    placement: ad.placement,
    title: ad.title,
    imageUrl: ad.imageUrl,
    linkUrl: ad.linkUrl ?? undefined,
    active: ad.active,
    startDate: ad.startDate?.toISOString(),
    endDate: ad.endDate?.toISOString(),
    order: ad.order,
    clicks: ad.clicks,
    impressions: ad.impressions,
    createdAt: ad.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

async function findAdScoped(requester: AuthTokenPayload, adId: string) {
  const ad = await Ad.findById(adId);

  if (!ad) {
    throw new AppError(404, "AD_NOT_FOUND", "Anúncio não encontrado");
  }

  if (!isDevAdmin(requester) && String(ad.churchId) !== requester.churchId) {
    throw new AppError(404, "AD_NOT_FOUND", "Anúncio não encontrado");
  }

  return ad;
}

export async function createAd(requester: AuthTokenPayload, data: CreateAdDTO): Promise<AdDTO> {
  const ad = await Ad.create({
    churchId: requester.churchId,
    format: data.format,
    placement: data.placement,
    title: data.title,
    imageUrl: data.imageUrl,
    linkUrl: data.linkUrl,
    active: data.active ?? true,
    startDate: data.startDate,
    endDate: data.endDate,
    order: data.order ?? 0,
  });

  return toAdDTO(ad);
}

export async function listAds(requester: AuthTokenPayload): Promise<AdDTO[]> {
  const ads = await Ad.find({ churchId: requester.churchId }).sort({ placement: 1, order: 1, createdAt: -1 });

  return ads.map(toAdDTO);
}

export async function getAd(requester: AuthTokenPayload, adId: string): Promise<AdDTO> {
  const ad = await findAdScoped(requester, adId);

  return toAdDTO(ad);
}

export async function updateAd(
  requester: AuthTokenPayload,
  adId: string,
  data: UpdateAdDTO,
): Promise<AdDTO> {
  const ad = await findAdScoped(requester, adId);

  if (data.format !== undefined) ad.format = data.format;
  if (data.placement !== undefined) ad.placement = data.placement;
  if (data.title !== undefined) ad.title = data.title;
  if (data.imageUrl !== undefined) ad.imageUrl = data.imageUrl;
  if (data.linkUrl !== undefined) ad.linkUrl = data.linkUrl;
  if (data.active !== undefined) ad.active = data.active;
  if (data.startDate !== undefined) ad.startDate = data.startDate;
  if (data.endDate !== undefined) ad.endDate = data.endDate;
  if (data.order !== undefined) ad.order = data.order;

  await ad.save();

  return toAdDTO(ad);
}

export async function deleteAd(requester: AuthTokenPayload, adId: string): Promise<void> {
  const ad = await findAdScoped(requester, adId);

  await ad.deleteOne();
}

/** Retorna um único anúncio ativo (dentro do período vigente) sorteado entre os elegíveis para a posição/formato. */
async function pickRandomActiveAd(
  churchId: string,
  placement: string,
  format: "card" | "slide",
): Promise<AdDTO | null> {
  const now = new Date();

  const ads = await Ad.find({
    churchId,
    placement,
    format,
    active: true,
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
    ],
  });

  if (ads.length === 0) {
    return null;
  }

  const chosen = ads[Math.floor(Math.random() * ads.length)];
  await Ad.updateOne({ _id: chosen._id }, { $inc: { impressions: 1 } });

  return toAdDTO(chosen);
}

export async function getRandomActiveAd(
  requester: AuthTokenPayload,
  placement: string,
  format: "card" | "slide",
): Promise<AdDTO | null> {
  return pickRandomActiveAd(requester.churchId, placement, format);
}

export async function getRandomActiveAdPublic(
  churchId: string,
  placement: string,
  format: "card" | "slide",
): Promise<AdDTO | null> {
  return pickRandomActiveAd(churchId, placement, format);
}

export async function registerClick(requester: AuthTokenPayload, adId: string): Promise<void> {
  const ad = await Ad.findOne({ _id: adId, churchId: requester.churchId });

  if (!ad) {
    throw new AppError(404, "AD_NOT_FOUND", "Anúncio não encontrado");
  }

  await Ad.updateOne({ _id: adId }, { $inc: { clicks: 1 } });
}

export async function registerClickPublic(churchId: string, adId: string): Promise<void> {
  const ad = await Ad.findOne({ _id: adId, churchId });

  if (!ad) {
    throw new AppError(404, "AD_NOT_FOUND", "Anúncio não encontrado");
  }

  await Ad.updateOne({ _id: adId }, { $inc: { clicks: 1 } });
}

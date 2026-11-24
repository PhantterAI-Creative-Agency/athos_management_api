import { Types } from "mongoose";
import { env } from "../config/env";
import { Church } from "../models/Church.model";
import { User } from "../models/User.model";
import { RadioTrack } from "../models/RadioTrack.model";
import { ChatMessage } from "../models/ChatMessage.model";
import { Offering } from "../models/Offering.model";
import { PaymentAccount } from "../models/PaymentAccount.model";
import { AppError } from "../middlewares/errorHandler";
import { normalizeHost } from "../helpers/theme.helper";
import { enqueueAdminInviteEmail } from "../jobs/adminInviteEmail.job";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface ChurchUsageDTO {
  members: number;
  activeMembers: number;
  storageBytes: number;
  storageLimitBytes: number;
  aiMessagesLast30Days: number;
  paidOfferingsLast30Days: number;
  mercadoPagoConnected: boolean;
}

export interface PlatformChurchDTO {
  id: string;
  name: string;
  slug: string;
  domains: string[];
  createdAt: string;
  usage: ChurchUsageDTO;
}

export function storageLimitBytes(church: { limits?: { storageMb?: number | null } | null }): number {
  const mb = church.limits?.storageMb ?? env.CHURCH_STORAGE_LIMIT_MB;
  return mb * 1024 * 1024;
}

export async function getStorageUsedBytes(churchId: string | Types.ObjectId): Promise<number> {
  const [row] = await RadioTrack.aggregate<{ total: number }>([
    { $match: { churchId: new Types.ObjectId(String(churchId)) } },
    { $group: { _id: null, total: { $sum: { $ifNull: ["$size", 0] } } } },
  ]);
  return row?.total ?? 0;
}

/** Custo e uso de uma igreja: membros, armazenamento, IA e ofertas (URS-TEN-07). */
export async function getChurchUsage(churchId: string): Promise<ChurchUsageDTO> {
  const church = await Church.findById(churchId).select("limits").lean();
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");

  const since = new Date(Date.now() - 30 * 86_400_000);
  const id = new Types.ObjectId(churchId);
  const [members, activeMembers, storageBytes, aiMessagesLast30Days, paidOfferingsLast30Days, mp] = await Promise.all([
    User.countDocuments({ churchId: id }),
    User.countDocuments({ churchId: id, active: true }),
    getStorageUsedBytes(id),
    ChatMessage.countDocuments({ churchId: id, createdAt: { $gte: since } }),
    Offering.countDocuments({ churchId: id, status: "paid", createdAt: { $gte: since } }),
    PaymentAccount.exists({ churchId: id, status: "connected" }),
  ]);

  return {
    members,
    activeMembers,
    storageBytes,
    storageLimitBytes: storageLimitBytes(church),
    aiMessagesLast30Days,
    paidOfferingsLast30Days,
    mercadoPagoConnected: !!mp,
  };
}

export async function listPlatformChurches(): Promise<PlatformChurchDTO[]> {
  const churches = await Church.find().select("name slug domains createdAt").sort({ createdAt: -1 }).lean();
  return Promise.all(
    churches.map(async (church) => ({
      id: String(church._id),
      name: church.name,
      slug: church.slug,
      domains: church.domains ?? [],
      createdAt: church.createdAt.toISOString(),
      usage: await getChurchUsage(String(church._id)),
    })),
  );
}

async function assertDomainsFree(domains: string[], exceptChurchId?: string): Promise<string[]> {
  const normalized = [...new Set(domains.map(normalizeHost).filter(Boolean))];
  if (!normalized.length) return [];
  const taken = await Church.findOne({
    domains: { $in: normalized },
    ...(exceptChurchId ? { _id: { $ne: exceptChurchId } } : {}),
  })
    .select("slug")
    .lean();
  if (taken) throw new AppError(409, "DOMAIN_IN_USE", `Domínio já usado pela igreja "${taken.slug}"`);
  return normalized;
}

export interface CreateChurchInput {
  name: string;
  slug?: string;
  logoUrl?: string;
  domains?: string[];
  storageMb?: number;
  admin: { name: string; email: string };
}

/**
 * Implantação de uma igreja nova pelo painel da plataforma, sem deploy (URS-TEN-04): cria a
 * igreja, o primeiro administrador e envia o convite para ele definir a senha.
 */
export async function createChurchWithAdmin(input: CreateChurchInput): Promise<{ church: PlatformChurchDTO; adminId: string }> {
  const slug = slugify(input.slug || input.name);
  if (!slug) throw new AppError(400, "INVALID_SLUG", "Não foi possível gerar o endereço (slug) da igreja");
  if (await Church.exists({ slug })) throw new AppError(409, "SLUG_ALREADY_EXISTS", "Já existe uma igreja com este endereço");

  const email = input.admin.email.trim().toLowerCase();
  if (await User.exists({ email })) throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Este e-mail já tem cadastro na plataforma");

  const domains = await assertDomainsFree(input.domains ?? []);

  const church = await Church.create({
    name: input.name.trim(),
    slug,
    // Sem logo, o site mostra as iniciais da igreja até o admin enviar a logo em Geral.
    logoUrl: input.logoUrl || "none",
    domains,
    ...(input.storageMb ? { limits: { storageMb: input.storageMb } } : {}),
  });

  let admin;
  try {
    admin = await User.create({
      churchId: church._id,
      name: input.admin.name.trim(),
      email,
      roles: ["admin"],
      active: true,
      isChurchMember: true,
    });
  } catch (error) {
    await Church.deleteOne({ _id: church._id });
    throw error;
  }

  await enqueueAdminInviteEmail({
    to: email,
    name: admin.name,
    churchName: church.name,
    siteUrl: domains[0] ? `https://${domains[0]}` : undefined,
  }).catch((error) => console.error("[admin-invite-email] falha ao enviar convite", error));

  return {
    church: {
      id: String(church._id),
      name: church.name,
      slug: church.slug,
      domains: church.domains ?? [],
      createdAt: church.createdAt.toISOString(),
      usage: await getChurchUsage(String(church._id)),
    },
    adminId: String(admin._id),
  };
}

export async function updatePlatformChurch(
  churchId: string,
  data: { domains?: string[]; storageMb?: number | null },
): Promise<PlatformChurchDTO> {
  const church = await Church.findById(churchId);
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  if (data.domains !== undefined) church.set("domains", await assertDomainsFree(data.domains, churchId));
  if (data.storageMb !== undefined) church.set("limits.storageMb", data.storageMb ?? undefined);
  await church.save();
  return {
    id: String(church._id),
    name: church.name,
    slug: church.slug,
    domains: church.domains ?? [],
    createdAt: church.createdAt.toISOString(),
    usage: await getChurchUsage(String(church._id)),
  };
}

import crypto from "node:crypto";
import { Types } from "mongoose";
import { LegalDocument } from "../models/LegalDocument.model";
import { LegalAcceptance } from "../models/LegalAcceptance.model";
import { Church } from "../models/Church.model";
import { AppError } from "../middlewares/errorHandler";
import { isFamilyManager } from "../helpers/family.helper";
import { isValidCnpj, isValidCpf, onlyDigits } from "../helpers/brDocument.helper";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import {
  CHURCH_SCOPE_ROLES,
  LEGAL_DOCUMENT_RULES,
  LEGAL_DOCUMENT_TYPES,
  type AcceptLegalDocumentDTO,
  type LegalAcceptanceAction,
  type LegalAcceptanceDTO,
  type LegalDocumentDTO,
  type LegalDocumentType,
  type PendingLegalDocumentDTO,
  type PendingReason,
  type PublishLegalDocumentDTO,
  type RequestEvidence,
  type RevokeLegalDocumentDTO,
} from "../interfaces/legal.interface";

const PLATFORM_NAME = "Athos Management";

type LegalDocumentLike = {
  _id: unknown;
  type: string;
  version: number;
  title: string;
  content: string;
  contentHash: string;
  requiresReacceptance: boolean;
  publishedAt: Date;
};

type LegalAcceptanceLike = {
  _id: unknown;
  action: string;
  documentType: string;
  version: number;
  userId: unknown;
  churchId: unknown;
  onBehalfOfUserId?: unknown;
  signer?: { name: string; cpf: string; role: string; cnpj: string } | null;
  createdAt: Date;
};

interface RenderContext {
  churchName?: string;
  churchSlug?: string;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function renderContent(template: string, ctx: RenderContext): string {
  const values: Record<string, string> = {
    platformName: PLATFORM_NAME,
    churchName: ctx.churchName ?? "a igreja",
    churchSlug: ctx.churchSlug ?? "",
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

function maskCpf(cpf: string): string {
  const digits = onlyDigits(cpf);
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function toDocumentDTO(doc: LegalDocumentLike, ctx: RenderContext): LegalDocumentDTO {
  return {
    id: String(doc._id),
    type: doc.type as LegalDocumentType,
    version: doc.version,
    title: doc.title,
    content: renderContent(doc.content, ctx),
    contentHash: doc.contentHash,
    requiresReacceptance: doc.requiresReacceptance,
    publishedAt: doc.publishedAt.toISOString(),
  };
}

function toAcceptanceDTO(record: LegalAcceptanceLike): LegalAcceptanceDTO {
  return {
    id: String(record._id),
    type: record.documentType as LegalDocumentType,
    action: record.action as LegalAcceptanceAction,
    version: record.version,
    userId: String(record.userId),
    churchId: String(record.churchId),
    onBehalfOfUserId: record.onBehalfOfUserId ? String(record.onBehalfOfUserId) : undefined,
    signer: record.signer
      ? {
          name: record.signer.name,
          cpf: maskCpf(record.signer.cpf),
          role: record.signer.role,
          cnpj: record.signer.cnpj,
        }
      : undefined,
    createdAt: record.createdAt.toISOString(),
  };
}

async function findCurrentDocument(type: LegalDocumentType) {
  return LegalDocument.findOne({ type, publishedAt: { $lte: new Date() } }).sort({ version: -1 });
}

/** Menor versão aceita que ainda vale: a última publicada que exigiu novo aceite. */
async function getBaselineVersion(type: LegalDocumentType): Promise<number | null> {
  const baseline = await LegalDocument.findOne({
    type,
    publishedAt: { $lte: new Date() },
    requiresReacceptance: true,
  })
    .sort({ version: -1 })
    .select("version")
    .lean();
  return baseline?.version ?? null;
}

interface AcceptanceSubject {
  type: LegalDocumentType;
  userId?: string;
  churchId?: string;
  onBehalfOfUserId?: string;
}

function subjectFilter(subject: AcceptanceSubject): Record<string, unknown> {
  const rule = LEGAL_DOCUMENT_RULES[subject.type];
  if (rule.scope === "church") {
    return { churchId: new Types.ObjectId(subject.churchId), documentType: subject.type };
  }
  return {
    userId: new Types.ObjectId(subject.userId),
    documentType: subject.type,
    onBehalfOfUserId: subject.onBehalfOfUserId ? new Types.ObjectId(subject.onBehalfOfUserId) : null,
  };
}

async function findLatestRecord(subject: AcceptanceSubject) {
  return LegalAcceptance.findOne(subjectFilter(subject)).sort({ createdAt: -1, _id: -1 }).lean();
}

function evaluate(
  latest: { action: string; version: number } | null,
  baselineVersion: number,
): PendingReason | null {
  if (!latest) return "never_accepted";
  if (latest.action === "revoke") return "revoked";
  if (latest.version < baselineVersion) return "new_version";
  return null;
}

/**
 * Indica se existe aceite vigente (não revogado e de versão ainda válida) para o documento.
 * Usado por outros módulos: consentimento de dados sensíveis, ativação da rádio etc.
 */
export async function hasActiveAcceptance(subject: AcceptanceSubject): Promise<boolean> {
  const baselineVersion = await getBaselineVersion(subject.type);
  if (baselineVersion === null) return false;
  const latest = await findLatestRecord(subject);
  return evaluate(latest, baselineVersion) === null;
}

export async function getCurrentDocument(type: LegalDocumentType, churchSlug?: string): Promise<LegalDocumentDTO> {
  const doc = await findCurrentDocument(type);
  if (!doc) throw new AppError(404, "LEGAL_DOCUMENT_NOT_FOUND", "Documento ainda não publicado");

  let ctx: RenderContext = {};
  if (churchSlug) {
    const church = await Church.findOne({ slug: churchSlug }).select("name slug").lean();
    if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
    ctx = { churchName: church.name, churchSlug: church.slug };
  }

  return toDocumentDTO(doc, ctx);
}

export async function publishDocument(data: PublishLegalDocumentDTO, publisherId: string): Promise<LegalDocumentDTO> {
  const last = await LegalDocument.findOne({ type: data.type }).sort({ version: -1 }).select("version").lean();
  const version = (last?.version ?? 0) + 1;

  const doc = await LegalDocument.create({
    type: data.type,
    version,
    title: data.title,
    content: data.content,
    contentHash: sha256(data.content),
    // A primeira versão sempre exige aceite.
    requiresReacceptance: version === 1 ? true : data.requiresReacceptance,
    publishedAt: data.publishedAt ?? new Date(),
    publishedBy: new Types.ObjectId(publisherId),
  });

  return toDocumentDTO(doc, {});
}

export async function listDocuments(type?: LegalDocumentType): Promise<LegalDocumentDTO[]> {
  const docs = await LegalDocument.find(type ? { type } : {}).sort({ type: 1, version: -1 }).lean();
  return docs.map((doc) => toDocumentDTO(doc, {}));
}

function canActForChurch(user: AuthTokenPayload): boolean {
  return user.roles.some((role) => CHURCH_SCOPE_ROLES.includes(role));
}

export async function listPending(user: AuthTokenPayload): Promise<PendingLegalDocumentDTO[]> {
  const pending: PendingLegalDocumentDTO[] = [];

  for (const type of LEGAL_DOCUMENT_TYPES) {
    const rule = LEGAL_DOCUMENT_RULES[type];
    if (!rule.requiredOnAccess) continue;
    if (rule.scope === "church" && !canActForChurch(user)) continue;

    const current = await findCurrentDocument(type);
    if (!current) continue;

    const baselineVersion = (await getBaselineVersion(type)) ?? current.version;
    const latest = await findLatestRecord({ type, userId: user.sub, churchId: user.churchId });
    const reason = evaluate(latest, baselineVersion);
    if (!reason) continue;

    pending.push({
      type,
      title: current.title,
      version: current.version,
      contentHash: current.contentHash,
      scope: rule.scope,
      requiresSigner: rule.requiresSigner,
      reason,
    });
  }

  return pending;
}

async function assertOnBehalfOfAllowed(
  type: LegalDocumentType,
  user: AuthTokenPayload,
  onBehalfOfUserId?: string,
): Promise<void> {
  if (!onBehalfOfUserId) return;

  if (!LEGAL_DOCUMENT_RULES[type].allowOnBehalfOf) {
    throw new AppError(400, "ON_BEHALF_NOT_ALLOWED", "Este documento não pode ser aceito em nome de outra pessoa");
  }
  if (!Types.ObjectId.isValid(onBehalfOfUserId) || !(await isFamilyManager(user.sub, onBehalfOfUserId))) {
    throw new AppError(403, "FORBIDDEN", "Apenas o responsável pode aceitar em nome deste usuário");
  }
}

function assertChurchScopeAllowed(type: LegalDocumentType, user: AuthTokenPayload): void {
  if (LEGAL_DOCUMENT_RULES[type].scope === "church" && !canActForChurch(user)) {
    throw new AppError(403, "FORBIDDEN", "Apenas o administrador da igreja pode aceitar este documento");
  }
}

function normalizeSigner(type: LegalDocumentType, signer: AcceptLegalDocumentDTO["signer"]) {
  if (!LEGAL_DOCUMENT_RULES[type].requiresSigner) return undefined;

  if (!signer) {
    throw new AppError(400, "SIGNER_REQUIRED", "Informe os dados do representante legal da igreja");
  }
  if (!isValidCpf(signer.cpf)) throw new AppError(400, "INVALID_CPF", "CPF do representante legal inválido");
  if (!isValidCnpj(signer.cnpj)) throw new AppError(400, "INVALID_CNPJ", "CNPJ da igreja inválido");

  return { name: signer.name, cpf: onlyDigits(signer.cpf), role: signer.role, cnpj: onlyDigits(signer.cnpj) };
}

export async function acceptDocument(
  type: LegalDocumentType,
  data: AcceptLegalDocumentDTO,
  user: AuthTokenPayload,
  evidence: RequestEvidence,
): Promise<LegalAcceptanceDTO> {
  assertChurchScopeAllowed(type, user);
  await assertOnBehalfOfAllowed(type, user, data.onBehalfOfUserId);

  const current = await findCurrentDocument(type);
  if (!current) throw new AppError(404, "LEGAL_DOCUMENT_NOT_FOUND", "Documento ainda não publicado");

  if (data.version !== current.version || data.contentHash !== current.contentHash) {
    throw new AppError(
      409,
      "LEGAL_VERSION_MISMATCH",
      "O documento foi atualizado. Leia a versão mais recente antes de aceitar",
    );
  }

  const signer = normalizeSigner(type, data.signer);

  const church = await Church.findById(user.churchId).select("name slug").lean();
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");

  const rendered = renderContent(current.content, { churchName: church.name, churchSlug: church.slug });

  const record = await LegalAcceptance.create({
    action: "accept",
    userId: new Types.ObjectId(user.sub),
    churchId: church._id,
    onBehalfOfUserId: data.onBehalfOfUserId ? new Types.ObjectId(data.onBehalfOfUserId) : undefined,
    documentId: current._id,
    documentType: type,
    version: current.version,
    contentHash: current.contentHash,
    renderedHash: sha256(rendered),
    signer,
    ip: evidence.ip,
    forwardedFor: evidence.forwardedFor,
    userAgent: evidence.userAgent,
  });

  return toAcceptanceDTO(record);
}

export async function revokeDocument(
  type: LegalDocumentType,
  data: RevokeLegalDocumentDTO,
  user: AuthTokenPayload,
  evidence: RequestEvidence,
): Promise<LegalAcceptanceDTO> {
  if (!LEGAL_DOCUMENT_RULES[type].revocable) {
    throw new AppError(
      400,
      "NOT_REVOCABLE",
      "Este documento não pode ser revogado. Para encerrar a conta, solicite a exclusão de dados",
    );
  }
  assertChurchScopeAllowed(type, user);
  await assertOnBehalfOfAllowed(type, user, data.onBehalfOfUserId);

  const latest = await findLatestRecord({
    type,
    userId: user.sub,
    churchId: user.churchId,
    onBehalfOfUserId: data.onBehalfOfUserId,
  });
  if (!latest || latest.action !== "accept") {
    throw new AppError(404, "ACCEPTANCE_NOT_FOUND", "Não há aceite vigente para revogar");
  }

  const record = await LegalAcceptance.create({
    action: "revoke",
    userId: new Types.ObjectId(user.sub),
    churchId: latest.churchId,
    onBehalfOfUserId: latest.onBehalfOfUserId,
    documentId: latest.documentId,
    documentType: type,
    version: latest.version,
    contentHash: latest.contentHash,
    renderedHash: latest.renderedHash,
    ip: evidence.ip,
    forwardedFor: evidence.forwardedFor,
    userAgent: evidence.userAgent,
  });

  return toAcceptanceDTO(record);
}

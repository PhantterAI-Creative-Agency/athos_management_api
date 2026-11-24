import { Church } from "../models/Church.model";
import { LegalAcceptance } from "../models/LegalAcceptance.model";
import { AppError } from "../middlewares/errorHandler";
import { resolveFeatures } from "../helpers/features.helper";
import { getBillingState, planAllows } from "../helpers/plans.helper";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type { RequestEvidence } from "../interfaces/legal.interface";
import { acceptDocument, getCurrentDocument, hasActiveAcceptance } from "./legal.service";

export interface RadioStatusDTO {
  /** Rádio ligada nas configurações da igreja. */
  enabled: boolean;
  /** Termo de responsabilidade aceito na versão vigente. */
  termsAccepted: boolean;
  /** No ar: ligada E com termo vigente aceito. */
  active: boolean;
  /** Versão vigente do termo (para aceitar). */
  terms?: { version: number; contentHash: string; title: string };
  acceptedAt?: string;
  acceptedVersion?: number;
}

/**
 * A rádio só fica no ar com a flag ligada **e** o termo de responsabilidade (direitos autorais /
 * ECAD) aceito na versão vigente (URS-RAD-01 a RAD-03). Uma nova versão que exija novo aceite
 * tira a rádio do ar até o admin aceitar de novo.
 */
export async function isRadioActive(churchId: string): Promise<boolean> {
  const church = await Church.findById(churchId).select("settings subscription").lean();
  if (!church || !resolveFeatures(church.settings, church.subscription).radio) return false;
  return hasActiveAcceptance({ type: "radio_liability", churchId });
}

export async function getRadioStatus(churchId: string): Promise<RadioStatusDTO> {
  const church = await Church.findById(churchId).select("settings subscription").lean();
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");

  const enabled = resolveFeatures(church.settings, church.subscription).radio;
  const termsAccepted = await hasActiveAcceptance({ type: "radio_liability", churchId });
  const current = await getCurrentDocument("radio_liability").catch(() => null);
  const last = await LegalAcceptance.findOne({ churchId, documentType: "radio_liability", action: "accept" })
    .sort({ createdAt: -1 })
    .lean();

  return {
    enabled,
    termsAccepted,
    active: enabled && termsAccepted,
    terms: current ? { version: current.version, contentHash: current.contentHash, title: current.title } : undefined,
    acceptedAt: termsAccepted && last ? last.createdAt.toISOString() : undefined,
    acceptedVersion: termsAccepted && last ? last.version : undefined,
  };
}

/** Aceita o termo vigente (com evidência) e liga a rádio numa só ação. */
export async function activateRadio(
  user: AuthTokenPayload,
  terms: { version: number; contentHash: string },
  evidence: RequestEvidence,
): Promise<RadioStatusDTO> {
  const church = await Church.findById(user.churchId).select("subscription").lean();
  if (!planAllows(getBillingState(church?.subscription).plan, "radio")) {
    throw new AppError(402, "PLAN_UPGRADE_REQUIRED", "A rádio faz parte do plano Completo");
  }
  await acceptDocument("radio_liability", terms, user, evidence);
  await Church.updateOne({ _id: user.churchId }, { $set: { "settings.features.radio": true } });
  return getRadioStatus(user.churchId);
}

/** Desliga a rádio (o aceite do termo continua registrado como histórico). */
export async function deactivateRadio(churchId: string): Promise<RadioStatusDTO> {
  await Church.updateOne({ _id: churchId }, { $set: { "settings.features.radio": false } });
  return getRadioStatus(churchId);
}

import { Types } from "mongoose";
import { User } from "../models/User.model";
import { Church } from "../models/Church.model";
import { Offering } from "../models/Offering.model";
import { EventRegistration } from "../models/EventRegistration.model";
import { MinistryVolunteer } from "../models/MinistryVolunteer.model";
import { Highlight } from "../models/Highlight.model";
import { PlanProgress } from "../models/PlanProgress.model";
import { CheckinLog } from "../models/CheckinLog.model";
import { Friendship } from "../models/Friendship.model";
import { Follow } from "../models/Follow.model";
import { MuralPost } from "../models/MuralPost.model";
import { ChatMessage } from "../models/ChatMessage.model";
import { PastoralCareRequest } from "../models/PastoralCareRequest.model";
import { Notification } from "../models/Notification.model";
import { LegalAcceptance } from "../models/LegalAcceptance.model";
import { AppError } from "../middlewares/errorHandler";
import { getSensitiveConsentHolders } from "./legal.service";

// Campos internos que não fazem parte dos dados do titular.
const INTERNAL_FIELDS = [
  "__v",
  "passwordHash",
  "refreshTokenHash",
  "passwordResetCodeHash",
  "passwordResetExpiresAt",
  "passwordResetAttempts",
];

function clean<T extends Record<string, unknown>>(doc: T): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...doc };
  for (const field of INTERNAL_FIELDS) delete copy[field];
  return copy;
}

type LeanUser = Record<string, unknown> & { _id: Types.ObjectId; medicalRecord?: unknown };

function profileWithConsent(user: LeanUser, consentHolders: Set<string>): Record<string, unknown> {
  const profile = clean(user);
  const hasConsent = consentHolders.has(String(user._id));
  if (!hasConsent) delete profile.medicalRecord;
  profile.sensitiveDataConsent = hasConsent;
  return profile;
}

export interface PersonalDataExportDTO {
  generatedAt: string;
  church: { name: string; slug: string } | null;
  profile: Record<string, unknown>;
  children: Record<string, unknown>[];
  records: Record<string, Record<string, unknown>[]>;
}

/**
 * Cópia dos dados pessoais do titular (direito de acesso e portabilidade, art. 18, II e V da
 * LGPD), em JSON estruturado. Inclui os filhos menores vinculados ao cadastro.
 */
export async function exportPersonalData(userId: string): Promise<PersonalDataExportDTO> {
  const user = await User.findById(userId).lean<LeanUser & { churchId: Types.ObjectId; familyData?: { childrenIds?: Types.ObjectId[] } }>();
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");

  const id = user._id;
  const childrenIds = user.familyData?.childrenIds ?? [];

  const [church, children, consentHolders] = await Promise.all([
    Church.findById(user.churchId).select("name slug").lean(),
    User.find({ _id: { $in: childrenIds } }).lean<LeanUser[]>(),
    getSensitiveConsentHolders([String(id), ...childrenIds.map(String)]),
  ]);

  const queries = {
    offerings: Offering.find({ userId: id }).lean(),
    eventRegistrations: EventRegistration.find({ userId: id }).lean(),
    ministries: MinistryVolunteer.find({ userId: id }).lean(),
    highlights: Highlight.find({ userId: id }).lean(),
    readingPlans: PlanProgress.find({ userId: id }).lean(),
    checkins: CheckinLog.find({ userId: id }).lean(),
    friendships: Friendship.find({ $or: [{ userId: id }, { friendId: id }] }).lean(),
    follows: Follow.find({ $or: [{ followerId: id }, { followingId: id }] }).lean(),
    muralPosts: MuralPost.find({ authorType: "user", authorId: id }).lean(),
    assistantMessages: ChatMessage.find({ userId: id }).lean(),
    pastoralCareRequests: PastoralCareRequest.find({ userId: id }).lean(),
    notifications: Notification.find({ userId: id }).lean(),
    legalAcceptances: LegalAcceptance.find({ $or: [{ userId: id }, { onBehalfOfUserId: id }] }).lean(),
  };

  const entries = await Promise.all(
    Object.entries(queries).map(async ([key, query]) => {
      const docs = (await query) as unknown as Record<string, unknown>[];
      return [key, docs.map(clean)] as const;
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    church: church ? { name: church.name, slug: church.slug } : null,
    profile: profileWithConsent(user, consentHolders),
    children: children.map((child) => profileWithConsent(child, consentHolders)),
    records: Object.fromEntries(entries),
  };
}

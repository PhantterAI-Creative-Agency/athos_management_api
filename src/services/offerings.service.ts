import { Types } from "mongoose";
import { Offering } from "../models/Offering.model";
import { createCheckout } from "../helpers/paymentProvider.helper";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type {
  CreateOfferingDTO,
  CreateOfferingResultDTO,
  ListOfferingsQueryDTO,
  OfferingDTO,
  OfferingsSummaryDTO,
  OfferingsSummaryQueryDTO,
  PaymentWebhookDTO,
} from "../interfaces/offering.interface";

type OfferingDocumentLike = {
  _id: unknown;
  churchId: unknown;
  userId: unknown;
  type: "event_registration" | "contribution" | "donation";
  relatedEventId?: unknown;
  amount: number;
  currency: "BRL";
  provider: OfferingDTO["provider"];
  providerPaymentId: string;
  status: OfferingDTO["status"];
  createdAt: Date;
};

function toOfferingDTO(offering: OfferingDocumentLike): OfferingDTO {
  return {
    id: String(offering._id),
    churchId: String(offering.churchId),
    userId: String(offering.userId),
    type: offering.type,
    relatedEventId: offering.relatedEventId ? String(offering.relatedEventId) : undefined,
    amount: offering.amount,
    currency: offering.currency,
    provider: offering.provider,
    providerPaymentId: offering.providerPaymentId,
    status: offering.status,
    createdAt: offering.createdAt.toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdmin(requester: AuthTokenPayload): boolean {
  return isDevAdmin(requester) || requester.roles.includes("admin");
}

function resolveScope(
  requester: AuthTokenPayload,
  query: { userId?: string; churchId?: string },
): { churchId: string; userId: string } {
  const churchId = isDevAdmin(requester) && query.churchId ? query.churchId : requester.churchId;
  const userId = isAdmin(requester) && query.userId ? query.userId : requester.sub;

  return { churchId, userId };
}

function yearRange(year: number): { $gte: Date; $lt: Date } {
  return { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) };
}

export async function createOffering(
  requester: AuthTokenPayload,
  data: CreateOfferingDTO,
): Promise<CreateOfferingResultDTO> {
  const { providerPaymentId, clientSecret, pixQrCode, pixCopyPaste } = await createCheckout(
    data.provider,
    data.amount,
  );

  const offering = await Offering.create({
    churchId: requester.churchId,
    userId: requester.sub,
    type: data.type,
    amount: data.amount,
    currency: "BRL",
    provider: data.provider,
    providerPaymentId,
    status: "pending",
  });

  return { ...toOfferingDTO(offering), clientSecret, pixQrCode, pixCopyPaste };
}

export async function createEventRegistrationOffering(
  requester: AuthTokenPayload,
  eventId: string,
  amount: number,
  provider: CreateOfferingDTO["provider"],
): Promise<CreateOfferingResultDTO> {
  const { providerPaymentId, clientSecret, pixQrCode, pixCopyPaste } = await createCheckout(provider, amount);

  const offering = await Offering.create({
    churchId: requester.churchId,
    userId: requester.sub,
    type: "event_registration",
    relatedEventId: eventId,
    amount,
    currency: "BRL",
    provider,
    providerPaymentId,
    status: "pending",
  });

  return { ...toOfferingDTO(offering), clientSecret, pixQrCode, pixCopyPaste };
}

export async function listOfferings(
  requester: AuthTokenPayload,
  query: ListOfferingsQueryDTO,
): Promise<OfferingDTO[]> {
  const { churchId, userId } = resolveScope(requester, query);

  const filter: Record<string, unknown> = { churchId, userId };

  if (query.year !== undefined) {
    filter.createdAt = yearRange(query.year);
  }

  const offerings = await Offering.find(filter).sort({ createdAt: -1 });

  return offerings.map(toOfferingDTO);
}

export async function getOfferingsSummary(
  requester: AuthTokenPayload,
  query: OfferingsSummaryQueryDTO,
): Promise<OfferingsSummaryDTO> {
  const { churchId, userId } = resolveScope(requester, query);

  const match: Record<string, unknown> = {
    churchId: new Types.ObjectId(churchId),
    userId: new Types.ObjectId(userId),
    status: "paid",
  };

  if (query.year !== undefined) {
    match.createdAt = yearRange(query.year);
  }

  const [result] = await Offering.aggregate<{ _id: null; total: number; count: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  return {
    year: query.year ?? "all",
    totalPaid: result?.total ?? 0,
    count: result?.count ?? 0,
  };
}

export async function getOffering(requester: AuthTokenPayload, offeringId: string): Promise<OfferingDTO> {
  const offering = await Offering.findById(offeringId);

  if (!offering) {
    throw new AppError(404, "OFFERING_NOT_FOUND", "Lançamento não encontrado");
  }

  const isSelf = String(offering.userId) === requester.sub;
  const isSameChurchAdmin = isAdmin(requester) && String(offering.churchId) === requester.churchId;

  if (!isSelf && !isSameChurchAdmin && !isDevAdmin(requester)) {
    throw new AppError(404, "OFFERING_NOT_FOUND", "Lançamento não encontrado");
  }

  return toOfferingDTO(offering);
}

export async function processPaymentWebhook(data: PaymentWebhookDTO): Promise<OfferingDTO | null> {
  const offering = await Offering.findOne({
    providerPaymentId: data.providerPaymentId,
    provider: data.provider,
  });

  if (!offering) {
    throw new AppError(404, "OFFERING_NOT_FOUND", "Lançamento não encontrado para este pagamento");
  }

  if (offering.status !== "pending") {
    return null;
  }

  offering.status = data.status;
  await offering.save();

  return toOfferingDTO(offering);
}

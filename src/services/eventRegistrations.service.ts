import { Event } from "../models/Event.model";
import { EventRegistration } from "../models/EventRegistration.model";
import { createEventRegistrationOffering } from "./offerings.service";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import { AppError } from "../middlewares/errorHandler";
import type {
  EventRegistrationDTO,
  ListEventRegistrationsQueryDTO,
  RegisterEventResultDTO,
  RegisterForEventDTO,
  UpdateEventRegistrationDTO,
} from "../interfaces/eventRegistration.interface";

type EventRegistrationDocumentLike = {
  _id: unknown;
  churchId: unknown;
  eventId: unknown;
  userId: unknown;
  status: EventRegistrationDTO["status"];
  paymentId?: unknown;
  createdAt: Date;
};

function toEventRegistrationDTO(registration: EventRegistrationDocumentLike): EventRegistrationDTO {
  return {
    id: String(registration._id),
    churchId: String(registration.churchId),
    eventId: String(registration.eventId),
    userId: String(registration.userId),
    status: registration.status,
    paymentId: registration.paymentId ? String(registration.paymentId) : undefined,
    createdAt: registration.createdAt.toISOString(),
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
}

function isAdmin(requester: AuthTokenPayload): boolean {
  return isDevAdmin(requester) || requester.roles.includes("admin");
}

async function findEventScoped(requester: AuthTokenPayload, eventId: string) {
  const event = await Event.findById(eventId);

  if (!event) {
    throw new AppError(404, "EVENT_NOT_FOUND", "Evento não encontrado");
  }

  if (!isDevAdmin(requester) && String(event.churchId) !== requester.churchId) {
    throw new AppError(404, "EVENT_NOT_FOUND", "Evento não encontrado");
  }

  return event;
}

async function findRegistrationScoped(requester: AuthTokenPayload, registrationId: string) {
  const registration = await EventRegistration.findById(registrationId);

  if (!registration) {
    throw new AppError(404, "EVENT_REGISTRATION_NOT_FOUND", "Inscrição não encontrada");
  }

  const isSelf = String(registration.userId) === requester.sub;
  const isSameChurchAdmin = isAdmin(requester) && String(registration.churchId) === requester.churchId;

  if (!isSelf && !isSameChurchAdmin && !isDevAdmin(requester)) {
    throw new AppError(404, "EVENT_REGISTRATION_NOT_FOUND", "Inscrição não encontrada");
  }

  return registration;
}

export async function registerForEvent(
  requester: AuthTokenPayload,
  eventId: string,
  data: RegisterForEventDTO,
): Promise<RegisterEventResultDTO> {
  const event = await findEventScoped(requester, eventId);

  const existing = await EventRegistration.findOne({
    eventId: event._id,
    userId: requester.sub,
    status: { $in: ["registered", "attending", "attended"] },
  });

  if (existing) {
    throw new AppError(409, "ALREADY_REGISTERED", "Você já está inscrito neste evento");
  }

  const price = event.price ?? 0;

  if (price > 0) {
    const offeringResult = await createEventRegistrationOffering(
      requester,
      String(event._id),
      price,
      data.provider,
    );

    const registration = await EventRegistration.create({
      churchId: requester.churchId,
      eventId: event._id,
      userId: requester.sub,
      status: "registered",
      paymentId: offeringResult.id,
    });

    return {
      ...toEventRegistrationDTO(registration),
      clientSecret: offeringResult.clientSecret,
      pixQrCode: offeringResult.pixQrCode,
      pixCopyPaste: offeringResult.pixCopyPaste,
    };
  }

  const registration = await EventRegistration.create({
    churchId: requester.churchId,
    eventId: event._id,
    userId: requester.sub,
    status: "attending",
  });

  return toEventRegistrationDTO(registration);
}

export async function listMyEventRegistrations(
  requester: AuthTokenPayload,
  query: ListEventRegistrationsQueryDTO,
): Promise<EventRegistrationDTO[]> {
  const filter: Record<string, unknown> = { userId: requester.sub };

  if (query.status) {
    filter.status = query.status;
  }

  const registrations = await EventRegistration.find(filter).sort({ createdAt: -1 });

  return registrations.map(toEventRegistrationDTO);
}

export async function updateEventRegistration(
  requester: AuthTokenPayload,
  registrationId: string,
  data: UpdateEventRegistrationDTO,
): Promise<EventRegistrationDTO> {
  const registration = await findRegistrationScoped(requester, registrationId);

  const isSelf = String(registration.userId) === requester.sub;
  const isAdminRequester = isAdmin(requester);

  if (!isAdminRequester && (!isSelf || data.status !== "cancelled")) {
    throw new AppError(403, "FORBIDDEN", "Você só pode cancelar sua própria inscrição");
  }

  registration.status = data.status;
  await registration.save();

  return toEventRegistrationDTO(registration);
}

export async function confirmEventRegistrationPayment(offeringId: string): Promise<void> {
  const registration = await EventRegistration.findOne({ paymentId: offeringId });

  if (!registration || registration.status !== "registered") {
    return;
  }

  registration.status = "attending";
  await registration.save();
}

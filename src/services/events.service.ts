import { Event } from "../models/Event.model";
import { AppError } from "../middlewares/errorHandler";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type {
  CreateEventDTO,
  EventDTO,
  ListEventsQueryDTO,
  UpdateEventDTO,
} from "../interfaces/event.interface";

function toEventDTO(event: {
  _id: unknown;
  title: string;
  imageUrl: string;
  featuredImageUrl?: string | null;
  date: Date;
  location?: string | null;
  price?: number | null;
  featured?: boolean | null;
}): EventDTO {
  return {
    id: String(event._id),
    title: event.title,
    imageUrl: event.imageUrl,
    featuredImageUrl: event.featuredImageUrl ?? undefined,
    date: event.date.toISOString(),
    location: event.location ?? undefined,
    price: event.price ?? undefined,
    featured: event.featured ?? false,
  };
}

function isDevAdmin(requester: AuthTokenPayload): boolean {
  return requester.roles.includes("devAdmin");
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

export async function listEvents(churchId: string, query: ListEventsQueryDTO): Promise<EventDTO[]> {
  const filter: Record<string, unknown> = { churchId };

  if (query.upcoming) {
    filter.date = { $gte: new Date() };
  }

  const events = await Event.find(filter).sort({ date: 1 });

  return events.map(toEventDTO);
}

export async function createEvent(requester: AuthTokenPayload, data: CreateEventDTO): Promise<EventDTO> {
  const event = await Event.create({
    churchId: requester.churchId,
    title: data.title,
    imageUrl: data.imageUrl,
    featuredImageUrl: data.featuredImageUrl,
    date: data.date,
    location: data.location,
    price: data.price,
    featured: data.featured ?? false,
  });

  return toEventDTO(event);
}

export async function getEvent(requester: AuthTokenPayload, eventId: string): Promise<EventDTO> {
  const event = await findEventScoped(requester, eventId);
  return toEventDTO(event);
}

export async function updateEvent(
  requester: AuthTokenPayload,
  eventId: string,
  data: UpdateEventDTO,
): Promise<EventDTO> {
  const event = await findEventScoped(requester, eventId);

  if (data.title !== undefined) event.title = data.title;
  if (data.imageUrl !== undefined) event.imageUrl = data.imageUrl;
  if (data.featuredImageUrl !== undefined) event.featuredImageUrl = data.featuredImageUrl;
  if (data.date !== undefined) event.date = data.date;
  if (data.location !== undefined) event.location = data.location;
  if (data.price !== undefined) event.price = data.price;
  if (data.featured !== undefined) event.featured = data.featured;

  await event.save();

  return toEventDTO(event);
}

export async function deleteEvent(requester: AuthTokenPayload, eventId: string): Promise<void> {
  const event = await findEventScoped(requester, eventId);
  await event.deleteOne();
}

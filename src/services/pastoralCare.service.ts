import { PrayerCareRecipient } from "../models/PrayerCareRecipient.model";
import { PastoralCareRequest, type PastoralCareRequestDocument } from "../models/PastoralCareRequest.model";
import { User } from "../models/User.model";
import { enqueuePushNotification } from "../jobs/pushNotification.job";
import { AppError } from "../middlewares/errorHandler";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type {
  CreatePrayerCareRecipientDTO,
  PastoralCareRequestDTO,
  PrayerCareRecipientDTO,
  UpdatePrayerCareRecipientDTO,
} from "../interfaces/pastoralCare.interface";

type PrayerCareRecipientDocumentLike = {
  _id: unknown;
  churchId: unknown;
  userId: unknown;
  active: boolean;
  createdAt: Date;
};

function toPrayerCareRecipientDTO(recipient: PrayerCareRecipientDocumentLike): PrayerCareRecipientDTO {
  return {
    id: String(recipient._id),
    churchId: String(recipient.churchId),
    userId: String(recipient.userId),
    active: recipient.active,
    createdAt: recipient.createdAt.toISOString(),
  };
}

function toPastoralCareRequestDTO(request: PastoralCareRequestDocument): PastoralCareRequestDTO {
  return {
    id: String(request._id),
    churchId: String(request.churchId),
    userId: request.userId ? String(request.userId) : undefined,
    guestName: request.guestName ?? undefined,
    guestWhatsapp: request.guestWhatsapp ?? undefined,
    message: request.message,
    status: request.status as PastoralCareRequestDTO["status"],
    notifiedRecipientIds: (request.notifiedRecipientIds ?? []).map((id) => String(id)),
    createdAt: request.createdAt.toISOString(),
  };
}

export async function listRecipients(requester: AuthTokenPayload): Promise<PrayerCareRecipientDTO[]> {
  const recipients = await PrayerCareRecipient.find({ churchId: requester.churchId }).sort({ createdAt: -1 });

  return recipients.map(toPrayerCareRecipientDTO);
}

export async function addRecipient(
  requester: AuthTokenPayload,
  data: CreatePrayerCareRecipientDTO,
): Promise<PrayerCareRecipientDTO> {
  const user = await User.findById(data.userId);

  if (!user || String(user.churchId) !== requester.churchId) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");
  }

  const recipient = await PrayerCareRecipient.findOneAndUpdate(
    { churchId: requester.churchId, userId: data.userId },
    { $setOnInsert: { active: true } },
    { upsert: true, new: true },
  );

  return toPrayerCareRecipientDTO(recipient!);
}

export async function updateRecipient(
  requester: AuthTokenPayload,
  recipientId: string,
  data: UpdatePrayerCareRecipientDTO,
): Promise<PrayerCareRecipientDTO> {
  const recipient = await PrayerCareRecipient.findById(recipientId);

  if (!recipient || String(recipient.churchId) !== requester.churchId) {
    throw new AppError(404, "PRAYER_CARE_RECIPIENT_NOT_FOUND", "Destinatário não encontrado");
  }

  recipient.active = data.active;
  await recipient.save();

  return toPrayerCareRecipientDTO(recipient);
}

export async function listRequests(requester: AuthTokenPayload): Promise<PastoralCareRequestDTO[]> {
  const requests = await PastoralCareRequest.find({ churchId: requester.churchId }).sort({ createdAt: -1 });

  return requests.map(toPastoralCareRequestDTO);
}

interface ForwardParams {
  churchId: string;
  message: string;
  userId?: string;
  guestName?: string;
  guestWhatsapp?: string;
}

export async function forwardPastoralCareRequest(params: ForwardParams): Promise<PastoralCareRequestDTO> {
  const recipients = await PrayerCareRecipient.find({ churchId: params.churchId, active: true });

  const request = await PastoralCareRequest.create({
    churchId: params.churchId,
    userId: params.userId,
    guestName: params.guestName,
    guestWhatsapp: params.guestWhatsapp,
    message: params.message,
    status: "pending",
    notifiedRecipientIds: recipients.map((recipient) => recipient.userId),
  });

  const requesterLabel = params.guestName ?? "Um usuário do sistema";

  await Promise.all(
    recipients.map((recipient) =>
      enqueuePushNotification({
        userId: String(recipient.userId),
        type: "pastoral_care_request",
        title: "Novo pedido de acompanhamento",
        body: `${requesterLabel} pediu oração/aconselhamento. Toque para ver os detalhes.`,
      }),
    ),
  );

  return toPastoralCareRequestDTO(request);
}

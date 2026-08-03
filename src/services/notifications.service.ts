import { DeviceToken } from "../models/DeviceToken.model";
import { Notification } from "../models/Notification.model";
import { AppError } from "../middlewares/errorHandler";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type {
  DeviceTokenDTO,
  ListNotificationsQueryDTO,
  NotificationDTO,
  RegisterDeviceTokenDTO,
} from "../interfaces/notification.interface";

type DeviceTokenDocumentLike = {
  _id: unknown;
  userId: unknown;
  platform: DeviceTokenDTO["platform"];
  token: string;
  createdAt: Date;
};

type NotificationDocumentLike = {
  _id: unknown;
  userId: unknown;
  type: NotificationDTO["type"];
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
};

function toDeviceTokenDTO(deviceToken: DeviceTokenDocumentLike): DeviceTokenDTO {
  return {
    id: String(deviceToken._id),
    userId: String(deviceToken.userId),
    platform: deviceToken.platform,
    token: deviceToken.token,
    createdAt: deviceToken.createdAt.toISOString(),
  };
}

function toNotificationDTO(notification: NotificationDocumentLike): NotificationDTO {
  return {
    id: String(notification._id),
    userId: String(notification.userId),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    read: notification.read,
    createdAt: notification.createdAt.toISOString(),
  };
}

export async function registerDeviceToken(
  requester: AuthTokenPayload,
  data: RegisterDeviceTokenDTO,
): Promise<DeviceTokenDTO> {
  const deviceToken = await DeviceToken.findOneAndUpdate(
    { userId: requester.sub, platform: data.platform },
    { $set: { token: data.token } },
    { upsert: true, new: true },
  );

  return toDeviceTokenDTO(deviceToken!);
}

export async function listNotifications(
  requester: AuthTokenPayload,
  query: ListNotificationsQueryDTO,
): Promise<NotificationDTO[]> {
  const filter: Record<string, unknown> = { userId: requester.sub };

  if (query.read !== undefined) {
    filter.read = query.read === "true";
  }

  const notifications = await Notification.find(filter).sort({ createdAt: -1 });

  return notifications.map(toNotificationDTO);
}

export async function markNotificationRead(
  requester: AuthTokenPayload,
  notificationId: string,
): Promise<NotificationDTO> {
  const notification = await Notification.findById(notificationId);

  if (!notification || String(notification.userId) !== requester.sub) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notificação não encontrada");
  }

  notification.read = true;
  await notification.save();

  return toNotificationDTO(notification);
}

export async function markAllNotificationsRead(requester: AuthTokenPayload): Promise<void> {
  await Notification.updateMany({ userId: requester.sub, read: false }, { $set: { read: true } });
}

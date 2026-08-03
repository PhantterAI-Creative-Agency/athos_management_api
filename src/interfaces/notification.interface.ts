import { z } from "zod";

export const DEVICE_TOKEN_PLATFORMS = ["ios", "android", "web"] as const;

export const NOTIFICATION_TYPES = [
  "verse_of_day",
  "event",
  "mural",
  "plan_reminder",
  "pastoral_care_request",
] as const;

export const registerDeviceTokenSchema = z.object({
  platform: z.enum(DEVICE_TOKEN_PLATFORMS),
  token: z.string().min(1, "token é obrigatório"),
});

export type RegisterDeviceTokenDTO = z.infer<typeof registerDeviceTokenSchema>;

export interface DeviceTokenDTO {
  id: string;
  userId: string;
  platform: (typeof DEVICE_TOKEN_PLATFORMS)[number];
  token: string;
  createdAt: string;
}

export const listNotificationsQuerySchema = z.object({
  read: z.enum(["true", "false"]).optional(),
});

export type ListNotificationsQueryDTO = z.infer<typeof listNotificationsQuerySchema>;

export interface NotificationDTO {
  id: string;
  userId: string;
  type: (typeof NOTIFICATION_TYPES)[number];
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface CreateNotificationInput {
  userId: string;
  type: (typeof NOTIFICATION_TYPES)[number];
  title: string;
  body: string;
}

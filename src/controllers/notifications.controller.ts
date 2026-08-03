import type { NextFunction, Request, Response } from "express";
import * as notificationsService from "../services/notifications.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { ListNotificationsQueryDTO, RegisterDeviceTokenDTO } from "../interfaces/notification.interface";

export async function registerDeviceToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as RegisterDeviceTokenDTO;
    const deviceToken = await notificationsService.registerDeviceToken(req.user!, body);
    await auditLog("OTHER", "DeviceToken", deviceToken.id, { platform: body.platform }, req);
    sendSuccess(res, deviceToken);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListNotificationsQueryDTO;
    const notifications = await notificationsService.listNotifications(req.user!, query);
    sendSuccess(res, notifications);
  } catch (error) {
    next(error);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const notification = await notificationsService.markNotificationRead(req.user!, String(req.params.id));
    sendSuccess(res, notification);
  } catch (error) {
    next(error);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await notificationsService.markAllNotificationsRead(req.user!);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

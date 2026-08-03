import type { NextFunction, Request, Response } from "express";
import * as pastoralCareService from "../services/pastoralCare.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  CreatePrayerCareRecipientDTO,
  UpdatePrayerCareRecipientDTO,
} from "../interfaces/pastoralCare.interface";

export async function listRecipients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const recipients = await pastoralCareService.listRecipients(req.user!);
    sendSuccess(res, recipients);
  } catch (error) {
    next(error);
  }
}

export async function addRecipient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreatePrayerCareRecipientDTO;
    const recipient = await pastoralCareService.addRecipient(req.user!, body);
    await auditLog("CREATE", "PrayerCareRecipient", recipient.id, undefined, req);
    sendSuccess(res, recipient, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateRecipient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdatePrayerCareRecipientDTO;
    const recipient = await pastoralCareService.updateRecipient(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "PrayerCareRecipient", recipient.id, { active: body.active }, req);
    sendSuccess(res, recipient);
  } catch (error) {
    next(error);
  }
}

export async function listRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await pastoralCareService.listRequests(req.user!);
    sendSuccess(res, requests);
  } catch (error) {
    next(error);
  }
}

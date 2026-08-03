import type { NextFunction, Request, Response } from "express";
import * as checkinService from "../services/checkin.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  CheckinTokenQueryDTO,
  ListCheckinQueryDTO,
  RegisterCheckinDTO,
} from "../interfaces/checkin.interface";

export async function getToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as CheckinTokenQueryDTO;
    const result = await checkinService.generateCheckinToken(req.user!, query.eventId);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as RegisterCheckinDTO;
    const log = await checkinService.registerCheckin(req.user!, body);
    await auditLog("CHECKIN", "CheckinLog", log.id, { tokenId: body.token }, req);
    sendSuccess(res, log, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListCheckinQueryDTO;
    const logs = await checkinService.listCheckins(req.user!, query);
    sendSuccess(res, logs);
  } catch (error) {
    next(error);
  }
}

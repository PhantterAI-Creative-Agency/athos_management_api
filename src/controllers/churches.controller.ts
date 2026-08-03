import type { NextFunction, Request, Response } from "express";
import * as churchesService from "../services/churches.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { SearchChurchesQueryDTO, UpdateChurchDTO } from "../interfaces/church.interface";

export async function search(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as SearchChurchesQueryDTO;
    const churches = await churchesService.searchChurches(query.q);
    sendSuccess(res, churches);
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurch(req.user!.churchId);
    sendSuccess(res, church);
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateChurchDTO;
    const church = await churchesService.updateChurch(req.user!.churchId, body);
    await auditLog("UPDATE", "Church", church.id, { name: church.name }, req);
    sendSuccess(res, church);
  } catch (error) {
    next(error);
  }
}

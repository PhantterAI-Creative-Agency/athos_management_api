import type { NextFunction, Request, Response } from "express";
import * as churchesService from "../services/churches.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  RegisterChurchDTO,
  SearchChurchesQueryDTO,
  UpdateChurchDTO,
} from "../interfaces/church.interface";

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as RegisterChurchDTO;
    const church = await churchesService.registerChurch(body);
    await auditLog("CREATE", "Church", church.id, { name: church.name, slug: church.slug }, req);
    sendSuccess(res, church, 201);
  } catch (error) {
    next(error);
  }
}

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

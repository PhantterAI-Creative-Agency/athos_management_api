import type { NextFunction, Request, Response } from "express";
import * as badgesService from "../services/badges.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateBadgeDTO, UpdateBadgeDTO } from "../interfaces/badge.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateBadgeDTO;
    const badge = await badgesService.createBadge(body);
    await auditLog("CREATE", "Badge", badge.id, { name: badge.name }, req);
    sendSuccess(res, badge, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const badges = await badgesService.listBadges();
    sendSuccess(res, badges);
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const badges = await badgesService.getUserBadges(req.user!);
    sendSuccess(res, badges);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateBadgeDTO;
    const badge = await badgesService.updateBadge(String(req.params.id), body);
    await auditLog("UPDATE", "Badge", badge.id, { name: badge.name }, req);
    sendSuccess(res, badge);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await badgesService.deleteBadge(String(req.params.id));
    await auditLog("DELETE", "Badge", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

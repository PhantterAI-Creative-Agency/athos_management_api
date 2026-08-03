import type { NextFunction, Request, Response } from "express";
import * as devotionalsService from "../services/devotionals.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateDevotionalDTO, UpdateDevotionalDTO } from "../interfaces/devotional.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateDevotionalDTO;
    const devotional = await devotionalsService.createDevotional(req.user!, body);
    await auditLog("CREATE", "Devotional", devotional.id, { title: devotional.title }, req);
    sendSuccess(res, devotional, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const devotionals = await devotionalsService.listDevotionals(req.user!);
    sendSuccess(res, devotionals);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const devotional = await devotionalsService.getDevotional(req.user!, String(req.params.id));
    sendSuccess(res, devotional);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateDevotionalDTO;
    const devotional = await devotionalsService.updateDevotional(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "Devotional", devotional.id, { title: devotional.title }, req);
    sendSuccess(res, devotional);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await devotionalsService.deleteDevotional(req.user!, String(req.params.id));
    await auditLog("DELETE", "Devotional", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

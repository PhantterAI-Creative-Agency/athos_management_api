import type { NextFunction, Request, Response } from "express";
import * as jingleService from "../services/jingle.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateJingleDTO, UpdateJingleDTO } from "../interfaces/jingle.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateJingleDTO;
    const jingle = await jingleService.createJingle(req.user!, body);
    await auditLog("CREATE", "Jingle", jingle.id, { title: jingle.title }, req);
    sendSuccess(res, jingle, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jingles = await jingleService.listJingles(req.user!);
    sendSuccess(res, jingles);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const jingle = await jingleService.getJingle(req.user!, String(req.params.id));
    sendSuccess(res, jingle);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateJingleDTO;
    const jingle = await jingleService.updateJingle(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "Jingle", jingle.id, { title: jingle.title }, req);
    sendSuccess(res, jingle);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await jingleService.deleteJingle(req.user!, String(req.params.id));
    await auditLog("DELETE", "Jingle", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

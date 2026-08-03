import type { NextFunction, Request, Response } from "express";
import * as mediaService from "../services/media.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateMediaDTO, UpdateMediaDTO } from "../interfaces/media.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateMediaDTO;
    const media = await mediaService.createMedia(req.user!, body);
    await auditLog("CREATE", "Media", media.id, { title: media.title }, req);
    sendSuccess(res, media, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const mediaList = await mediaService.listMedia(req.user!);
    sendSuccess(res, mediaList);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const media = await mediaService.getMedia(req.user!, String(req.params.id));
    sendSuccess(res, media);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateMediaDTO;
    const media = await mediaService.updateMedia(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "Media", media.id, { title: media.title }, req);
    sendSuccess(res, media);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await mediaService.deleteMedia(req.user!, String(req.params.id));
    await auditLog("DELETE", "Media", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

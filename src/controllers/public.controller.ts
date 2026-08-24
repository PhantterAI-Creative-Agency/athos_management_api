import type { NextFunction, Request, Response } from "express";
import * as churchesService from "../services/churches.service";
import * as eventsService from "../services/events.service";
import * as devotionalsService from "../services/devotionals.service";
import * as mediaService from "../services/media.service";
import * as ministriesService from "../services/ministries.service";
import { sendSuccess } from "../helpers/response.helper";

export async function getChurch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    sendSuccess(res, church);
  } catch (error) {
    next(error);
  }
}

export async function getEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    const events = await eventsService.listEvents(church.id, { upcoming: true });
    sendSuccess(res, events);
  } catch (error) {
    next(error);
  }
}

export async function getDevotionals(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    const devotionals = await devotionalsService.listDevotionalsPublic(church.id);
    sendSuccess(res, devotionals);
  } catch (error) {
    next(error);
  }
}

export async function getMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    const mediaList = await mediaService.listMediaPublic(church.id);
    sendSuccess(res, mediaList);
  } catch (error) {
    next(error);
  }
}

export async function getMinistries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    const ministries = await ministriesService.listMinistriesPublic(church.id);
    sendSuccess(res, ministries);
  } catch (error) {
    next(error);
  }
}

import type { NextFunction, Request, Response } from "express";
import * as churchesService from "../services/churches.service";
import * as eventsService from "../services/events.service";
import * as devotionalsService from "../services/devotionals.service";
import * as mediaService from "../services/media.service";
import * as radioService from "../services/radio.service";
import * as ministriesService from "../services/ministries.service";
import * as adsService from "../services/ads.service";
import { sendError, sendSuccess } from "../helpers/response.helper";
import type { ListAdsPublicQueryDTO } from "../interfaces/ad.interface";

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

export async function getRadio(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    const radio = await radioService.getRadioPublic(church.id);
    sendSuccess(res, radio);
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

export async function getAd(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListAdsPublicQueryDTO;
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    const ad = await adsService.getRandomActiveAdPublic(church.id, query.placement, query.format);
    sendSuccess(res, ad);
  } catch (error) {
    next(error);
  }
}

export async function clickAd(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    await adsService.registerClickPublic(church.id, String(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

/** Resolve a igreja pelo endereço do site (domínio/subdomínio cadastrado). */
export async function getChurchByHost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const host = String(req.query.host ?? "");
    const church = host ? await churchesService.findChurchByHost(host) : null;
    if (!church) {
      sendError(res, 404, "CHURCH_NOT_FOUND", "Nenhuma igreja cadastrada para este endereço");
      return;
    }
    sendSuccess(res, church);
  } catch (error) {
    next(error);
  }
}

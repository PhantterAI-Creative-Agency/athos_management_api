import type { NextFunction, Request, Response } from "express";
import * as adsService from "../services/ads.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateAdDTO, ListAdsPublicQueryDTO, UpdateAdDTO } from "../interfaces/ad.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateAdDTO;
    const ad = await adsService.createAd(req.user!, body);
    await auditLog("CREATE", "Ad", ad.id, { title: ad.title }, req);
    sendSuccess(res, ad, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ads = await adsService.listAds(req.user!);
    sendSuccess(res, ads);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ad = await adsService.getAd(req.user!, String(req.params.id));
    sendSuccess(res, ad);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateAdDTO;
    const ad = await adsService.updateAd(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "Ad", ad.id, { title: ad.title }, req);
    sendSuccess(res, ad);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await adsService.deleteAd(req.user!, String(req.params.id));
    await auditLog("DELETE", "Ad", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function random(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListAdsPublicQueryDTO;
    const ad = await adsService.getRandomActiveAd(req.user!, query.placement, query.format);
    sendSuccess(res, ad);
  } catch (error) {
    next(error);
  }
}

export async function registerClick(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await adsService.registerClick(req.user!, String(req.params.id));
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

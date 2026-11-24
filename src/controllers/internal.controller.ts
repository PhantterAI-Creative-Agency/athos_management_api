import type { NextFunction, Request, Response } from "express";
import * as mediaService from "../services/media.service";
import { refreshExpiringTokens } from "../services/mercadopagoAccount.service";
import { reconcileMercadoPagoPayments } from "../jobs/mercadopagoPayment.job";
import { runBillingCycle } from "../services/billing.service";
import { sendSuccess } from "../helpers/response.helper";

export async function syncYoutubeMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await mediaService.syncYoutubeVideosForAllChurches();
    sendSuccess(res, { synced: true });
  } catch (error) {
    next(error);
  }
}

export async function refreshMercadoPagoTokens(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await refreshExpiringTokens());
  } catch (error) {
    next(error);
  }
}

export async function reconcileMercadoPago(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await reconcileMercadoPagoPayments());
  } catch (error) {
    next(error);
  }
}

export async function billingCycle(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await runBillingCycle());
  } catch (error) {
    next(error);
  }
}

import type { NextFunction, Request, Response } from "express";
import * as offeringsService from "../services/offerings.service";
import { buildChurchPixCharge } from "../services/pix.service";
import { AppError } from "../middlewares/errorHandler";
import type { PixChargeQueryDTO } from "../interfaces/pix.interface";
import { enqueuePaymentWebhook } from "../jobs/paymentWebhook.job";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  CreateOfferingDTO,
  ListOfferingsQueryDTO,
  OfferingsSummaryQueryDTO,
  PaymentWebhookDTO,
} from "../interfaces/offering.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateOfferingDTO;
    const offering = await offeringsService.createOffering(req.user!, body);
    await auditLog("CREATE", "Offering", offering.id, { amount: body.amount, provider: body.provider }, req);
    sendSuccess(res, offering, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListOfferingsQueryDTO;
    const offerings = await offeringsService.listOfferings(req.user!, query);
    sendSuccess(res, offerings);
  } catch (error) {
    next(error);
  }
}

export async function summary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as OfferingsSummaryQueryDTO;
    const result = await offeringsService.getOfferingsSummary(req.user!, query);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const offering = await offeringsService.getOffering(req.user!, String(req.params.id));
    sendSuccess(res, offering);
  } catch (error) {
    next(error);
  }
}

export async function webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as PaymentWebhookDTO;
    await enqueuePaymentWebhook(body);
    await auditLog("OTHER", "Payment", undefined, { provider: body.provider, status: body.status }, req);
    sendSuccess(res, { received: true });
  } catch (error) {
    next(error);
  }
}

const PIX_DESCRIPTIONS: Record<NonNullable<PixChargeQueryDTO["type"]>, string> = {
  contribution: "Dizimo",
  donation: "Oferta",
};

/** PIX copia e cola + QR na chave da própria igreja (sem confirmação automática). */
export async function pix(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as PixChargeQueryDTO;
    const charge = await buildChurchPixCharge(req.user!.churchId, {
      amount: query.amount,
      description: query.type ? PIX_DESCRIPTIONS[query.type] : undefined,
    });
    if (!charge) {
      throw new AppError(404, "PIX_NOT_CONFIGURED", "A igreja ainda não cadastrou a chave PIX para ofertas");
    }
    sendSuccess(res, charge);
  } catch (error) {
    next(error);
  }
}

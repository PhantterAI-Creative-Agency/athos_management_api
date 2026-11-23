import type { NextFunction, Request, Response } from "express";
import * as accountService from "../services/mercadopagoAccount.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";

export async function connect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await accountService.startConnection(req.user!.churchId, req.user!.sub);
    await auditLog("OTHER", "PaymentAccount", undefined, { provider: "mercadopago", event: "connect_started" }, req);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

/** Redirecionamento do Mercado Pago após o admin autorizar (ou recusar). */
export async function callback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as Record<string, string | undefined>;
    const result = await accountService.handleCallback({ code: query.code, state: query.state, error: query.error });
    res.redirect(302, accountService.callbackRedirectUrl(result));
  } catch (error) {
    next(error);
  }
}

export async function status(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await accountService.getStatus(req.user!.churchId));
  } catch (error) {
    next(error);
  }
}

export async function disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await accountService.disconnect(req.user!.churchId, req.user!.sub);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

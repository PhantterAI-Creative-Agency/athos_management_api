import type { NextFunction, Request, Response } from "express";
import * as accountService from "../services/mercadopagoAccount.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import { sendError } from "../helpers/response.helper";
import { verifyWebhookSignature } from "../helpers/mercadopagoPayments.helper";
import { enqueueMercadoPagoPayment } from "../jobs/mercadopagoPayment.job";

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

/**
 * Notificações do Mercado Pago. A assinatura (x-signature) é conferida quando MP_WEBHOOK_SECRET
 * está configurado, mas o corpo nunca é usado como prova: o pagamento é sempre consultado na API
 * com o token da igreja antes de mudar qualquer status.
 */
export async function webhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as { type?: string; topic?: string; action?: string; data?: { id?: string | number } };
    const query = req.query as Record<string, string | undefined>;
    const type = body.type ?? query.type ?? query.topic;
    const dataId = query["data.id"] ?? (body.data?.id !== undefined ? String(body.data.id) : undefined) ?? query.id;

    const secret = process.env.MP_WEBHOOK_SECRET;
    if (secret) {
      const valid = verifyWebhookSignature({
        signatureHeader: req.headers["x-signature"] as string | undefined,
        requestId: req.headers["x-request-id"] as string | undefined,
        dataId,
        secret,
      });
      if (!valid) {
        console.warn("[mercadopago-webhook] assinatura inválida recusada");
        sendError(res, 401, "INVALID_SIGNATURE", "Assinatura inválida");
        return;
      }
    }

    if (type !== "payment" || !dataId || !/^\d+$/.test(dataId)) {
      sendSuccess(res, { received: true, ignored: true });
      return;
    }

    await enqueueMercadoPagoPayment(dataId);
    sendSuccess(res, { received: true });
  } catch (error) {
    next(error);
  }
}

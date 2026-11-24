import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { sendError, sendSuccess } from "../helpers/response.helper";
import { verifyWebhookSignature } from "../helpers/mercadopagoPayments.helper";
import { PLAN_IDS, type PlanId } from "../helpers/plans.helper";
import * as billingService from "../services/billing.service";

// Plano e mensalidade da igreja, cobrada na conta Mercado Pago da PhantterAI (PIX ou cartão).
const router = Router();
const churchAdmin = [authenticate, withRole(["admin"])];

const subscribeSchema = z.object({
  plan: z.enum(PLAN_IDS),
  paymentMethod: z.enum(["pix", "card"]),
});
const changePlanSchema = z.object({ plan: z.enum(PLAN_IDS) });

router.get("/me", ...churchAdmin, async (req, res, next) => {
  try {
    sendSuccess(res, await billingService.getBillingOverview(req.user!.churchId));
  } catch (error) {
    next(error);
  }
});

router.post("/subscribe", ...churchAdmin, validate(subscribeSchema), async (req, res, next) => {
  try {
    const body = req.validated?.body as z.infer<typeof subscribeSchema>;
    sendSuccess(res, await billingService.subscribe(req.user!.churchId, req.user!.sub, body));
  } catch (error) {
    next(error);
  }
});

router.post("/change-plan", ...churchAdmin, validate(changePlanSchema), async (req, res, next) => {
  try {
    const { plan } = req.validated?.body as { plan: PlanId };
    sendSuccess(res, await billingService.changePlan(req.user!.churchId, req.user!.sub, plan));
  } catch (error) {
    next(error);
  }
});

// PIX da mensalidade em aberto (gera um novo se o anterior expirou).
router.post("/pay", ...churchAdmin, async (req, res, next) => {
  try {
    sendSuccess(res, await billingService.payNow(req.user!.churchId));
  } catch (error) {
    next(error);
  }
});

router.post("/cancel", ...churchAdmin, async (req, res, next) => {
  try {
    sendSuccess(res, await billingService.cancelSubscription(req.user!.churchId, req.user!.sub));
  } catch (error) {
    next(error);
  }
});

// Notificações do Mercado Pago das mensalidades (conta da PhantterAI). A assinatura x-signature
// é conferida quando MP_WEBHOOK_SECRET existe; o corpo nunca é prova — tudo é consultado na API.
router.post("/mercadopago/webhook", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as { type?: string; topic?: string; data?: { id?: string | number } };
    const query = req.query as Record<string, string | undefined>;
    const type = body.type ?? query.type ?? query.topic;
    const dataId = query["data.id"] ?? (body.data?.id !== undefined ? String(body.data.id) : undefined) ?? query.id;
    const secret = process.env.MP_WEBHOOK_SECRET;
    if (
      secret &&
      !verifyWebhookSignature({
        signatureHeader: req.headers["x-signature"] as string | undefined,
        requestId: req.headers["x-request-id"] as string | undefined,
        dataId,
        secret,
      })
    ) {
      sendError(res, 401, "INVALID_SIGNATURE", "Assinatura inválida");
      return;
    }
    sendSuccess(res, { received: true, ...(await billingService.processBillingNotification(type, dataId)) });
  } catch (error) {
    next(error);
  }
});

export default router;

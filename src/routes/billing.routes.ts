import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { sendError, sendSuccess } from "../helpers/response.helper";
import { safeEqual } from "../helpers/crypto.helper";
import { PLAN_IDS, type PlanId } from "../helpers/plans.helper";
import * as billingService from "../services/billing.service";

// Plano e mensalidade da igreja (cobrada na conta da Athos pelo Asaas).
const router = Router();
const churchAdmin = [authenticate, withRole(["admin"])];

const subscribeSchema = z.object({
  plan: z.enum(PLAN_IDS),
  billingType: z.enum(["UNDEFINED", "BOLETO", "PIX"]).default("UNDEFINED"),
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

router.post("/cancel", ...churchAdmin, async (req, res, next) => {
  try {
    sendSuccess(res, await billingService.cancelSubscription(req.user!.churchId, req.user!.sub));
  } catch (error) {
    next(error);
  }
});

// Webhook do Asaas: autenticado pelo cabeçalho asaas-access-token (token definido no painel).
router.post("/asaas/webhook", async (req, res, next) => {
  try {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    const received = req.headers["asaas-access-token"];
    if (!expected) {
      sendError(res, 404, "NOT_FOUND", `Rota ${req.method} ${req.originalUrl} não encontrada`);
      return;
    }
    if (typeof received !== "string" || !safeEqual(received, expected)) {
      sendError(res, 401, "UNAUTHORIZED", "Token do webhook inválido");
      return;
    }
    const result = await billingService.processAsaasEvent(req.body ?? {});
    sendSuccess(res, { received: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;

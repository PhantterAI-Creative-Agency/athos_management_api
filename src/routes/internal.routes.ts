import { Router } from "express";
import * as internalController from "../controllers/internal.controller";
import { mediaSyncLimiter } from "../middlewares/rateLimiter";
import { requireCronSecret } from "../middlewares/cronSecret";

const router = Router();

router.get("/cron/media-youtube-sync", mediaSyncLimiter, internalController.syncYoutubeMedia);

// Renovação diária dos tokens do Mercado Pago (alternativa ao BullMQ quando não há Redis).
router.post("/cron/mercadopago-refresh-tokens", requireCronSecret, internalController.refreshMercadoPagoTokens);
// Conciliação de pagamentos pendentes (rodar a cada 10–15 min quando não há Redis).
router.post("/cron/mercadopago-reconcile", requireCronSecret, internalController.reconcileMercadoPago);
// Avisos de cobrança aos admins das igrejas (diário).
router.post("/cron/billing-notices", requireCronSecret, internalController.billingNotices);

export default router;

import { Router } from "express";
import * as offeringsController from "../controllers/offerings.controller";
import { validate } from "../middlewares/validate";
import { requireWebhookSecret } from "../middlewares/webhookSecret";
import { paymentWebhookSchema } from "../interfaces/offering.interface";

const router = Router();

// Chamado pelo provedor de pagamento, não pelo usuário. Protegido por segredo até a Sprint 5,
// quando passa a validar a assinatura do Mercado Pago.
router.post("/webhook", requireWebhookSecret, validate(paymentWebhookSchema), offeringsController.webhook);

export default router;

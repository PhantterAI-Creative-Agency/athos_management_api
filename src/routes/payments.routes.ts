import { Router } from "express";
import * as offeringsController from "../controllers/offerings.controller";
import { validate } from "../middlewares/validate";
import { requireWebhookSecret } from "../middlewares/webhookSecret";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import * as mercadopagoController from "../controllers/mercadopago.controller";
import { paymentWebhookSchema } from "../interfaces/offering.interface";

const router = Router();

// Chamado pelo provedor de pagamento, não pelo usuário. Protegido por segredo até a Sprint 5,
// quando passa a validar a assinatura do Mercado Pago.
router.post("/webhook", requireWebhookSecret, validate(paymentWebhookSchema), offeringsController.webhook);

// Conexão da conta Mercado Pago da igreja (OAuth). O dinheiro cai direto na conta da igreja.
const churchAdmin = [authenticate, withRole(["admin"])];
router.get("/mercadopago/connect", ...churchAdmin, mercadopagoController.connect);
router.get("/mercadopago/callback", mercadopagoController.callback);
router.get("/mercadopago/status", ...churchAdmin, mercadopagoController.status);
router.delete("/mercadopago", ...churchAdmin, mercadopagoController.disconnect);
// Notificações de pagamento do Mercado Pago (público; conferência sempre na API do Mercado Pago).
router.post("/mercadopago/webhook", mercadopagoController.webhook);

export default router;

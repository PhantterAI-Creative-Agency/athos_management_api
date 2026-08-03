import { Router } from "express";
import * as offeringsController from "../controllers/offerings.controller";
import { validate } from "../middlewares/validate";
import { paymentWebhookSchema } from "../interfaces/offering.interface";

const router = Router();

// Público — chamado pelo provedor de pagamento (Stripe/Pagar.me), não pelo usuário autenticado.
router.post("/webhook", validate(paymentWebhookSchema), offeringsController.webhook);

export default router;

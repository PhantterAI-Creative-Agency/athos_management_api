import { Router } from "express";
import * as offeringsController from "../controllers/offerings.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { requireFeature } from "../middlewares/requireFeature";
import {
  createOfferingSchema,
  listOfferingsQuerySchema,
  offeringsSummaryQuerySchema,
} from "../interfaces/offering.interface";
import { pixChargeQuerySchema } from "../interfaces/pix.interface";

const router = Router();

router.post("/", authenticate, requireFeature("onlineOfferings"), validate(createOfferingSchema), offeringsController.create);

router.get("/", authenticate, validate(listOfferingsQuerySchema, "query"), offeringsController.list);

router.get(
  "/summary",
  authenticate,
  validate(offeringsSummaryQuerySchema, "query"),
  offeringsController.summary,
);

// Chave PIX da igreja com BR Code e QR Code (valor opcional).
router.get(
  "/pix",
  authenticate,
  requireFeature("onlineOfferings"),
  validate(pixChargeQuerySchema, "query"),
  offeringsController.pix,
);

router.get("/:id", authenticate, offeringsController.getById);

export default router;

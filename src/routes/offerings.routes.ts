import { Router } from "express";
import * as offeringsController from "../controllers/offerings.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import {
  createOfferingSchema,
  listOfferingsQuerySchema,
  offeringsSummaryQuerySchema,
} from "../interfaces/offering.interface";

const router = Router();

router.post("/", authenticate, validate(createOfferingSchema), offeringsController.create);

router.get("/", authenticate, validate(listOfferingsQuerySchema, "query"), offeringsController.list);

router.get(
  "/summary",
  authenticate,
  validate(offeringsSummaryQuerySchema, "query"),
  offeringsController.summary,
);

router.get("/:id", authenticate, offeringsController.getById);

export default router;

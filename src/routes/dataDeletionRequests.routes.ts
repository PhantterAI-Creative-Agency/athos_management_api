import { Router } from "express";
import * as dataDeletionRequestsController from "../controllers/dataDeletionRequests.controller";
import { validate } from "../middlewares/validate";
import { dataDeletionRequestLimiter } from "../middlewares/rateLimiter";
import { createDataDeletionRequestSchema } from "../interfaces/dataDeletionRequest.interface";

const router = Router();

router.post(
  "/",
  dataDeletionRequestLimiter,
  validate(createDataDeletionRequestSchema),
  dataDeletionRequestsController.create,
);

export default router;

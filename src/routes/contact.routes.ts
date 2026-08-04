import { Router } from "express";
import * as contactController from "../controllers/contact.controller";
import { validate } from "../middlewares/validate";
import { contactLimiter } from "../middlewares/rateLimiter";
import { createContactMessageSchema } from "../interfaces/contact.interface";

const router = Router();

router.post("/", contactLimiter, validate(createContactMessageSchema), contactController.create);

export default router;

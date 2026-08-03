import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { authLimiter } from "../middlewares/rateLimiter";
import { loginSchema, refreshSchema } from "../interfaces/auth.interface";

const router = Router();

router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/refresh", authLimiter, validate(refreshSchema), authController.refresh);
router.post("/oauth/:provider", authLimiter, authController.oauth);
router.post("/logout", authenticate, authController.logout);

export default router;

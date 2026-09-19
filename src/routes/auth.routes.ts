import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { authLimiter, registerLimiter } from "../middlewares/rateLimiter";
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../interfaces/auth.interface";

const router = Router();

router.post("/register", registerLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/refresh", authLimiter, validate(refreshSchema), authController.refresh);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post(
  "/change-password",
  authenticate,
  authLimiter,
  validate(changePasswordSchema),
  authController.changePassword,
);
router.post("/oauth/:provider", authLimiter, authController.oauth);
router.post("/logout", authenticate, authController.logout);

export default router;

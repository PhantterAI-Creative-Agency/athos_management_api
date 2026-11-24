import { z } from "zod";
import { Router } from "express";
import * as usersController from "../controllers/users.controller";
import * as notificationsController from "../controllers/notifications.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole, withSelfFamilyOrRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { authLimiter } from "../middlewares/rateLimiter";
import {
  createChildSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "../interfaces/user.interface";
import { registerDeviceTokenSchema } from "../interfaces/notification.interface";

const router = Router();

router.post("/", authLimiter, validate(createUserSchema), usersController.create);

router.patch(
  "/me/device-token",
  authenticate,
  validate(registerDeviceTokenSchema),
  notificationsController.registerDeviceToken,
);

router.get(
  "/",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(listUsersQuerySchema, "query"),
  usersController.list,
);

// Importação de membros por planilha CSV (admin da igreja).
router.post(
  "/import",
  authenticate,
  withRole(["admin"]),
  validate(z.object({ csv: z.string().min(1, "Envie o conteúdo da planilha").max(5_000_000), dryRun: z.boolean().optional() })),
  usersController.importCsv,
);

// Cópia dos dados pessoais do próprio usuário (acesso/portabilidade — LGPD art. 18).
router.get("/me/export", authenticate, usersController.exportMe);

router.delete("/inactive", authenticate, withRole(["devAdmin"]), usersController.removeInactive);

router.get("/:id", authenticate, withSelfFamilyOrRole(["admin", "devAdmin"]), usersController.getById);

router.post(
  "/:id/children",
  authenticate,
  validate(createChildSchema),
  usersController.createChild,
);

router.patch(
  "/:id",
  authenticate,
  withSelfFamilyOrRole(["admin", "devAdmin"]),
  validate(updateUserSchema),
  usersController.update,
);

export default router;

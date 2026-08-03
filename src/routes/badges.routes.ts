import { Router } from "express";
import * as badgesController from "../controllers/badges.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { createBadgeSchema, updateBadgeSchema } from "../interfaces/badge.interface";

const router = Router();

router.post("/", authenticate, withRole(["devAdmin"]), validate(createBadgeSchema), badgesController.create);

router.get("/", authenticate, badgesController.list);

router.get("/me", authenticate, badgesController.me);

router.patch(
  "/:id",
  authenticate,
  withRole(["devAdmin"]),
  validate(updateBadgeSchema),
  badgesController.update,
);

router.delete("/:id", authenticate, withRole(["devAdmin"]), badgesController.remove);

export default router;

import { Router } from "express";
import * as devotionalsController from "../controllers/devotionals.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { createDevotionalSchema, updateDevotionalSchema } from "../interfaces/devotional.interface";

const router = Router();

router.post(
  "/",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(createDevotionalSchema),
  devotionalsController.create,
);

router.get("/", authenticate, devotionalsController.list);

router.get("/:id", authenticate, devotionalsController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateDevotionalSchema),
  devotionalsController.update,
);

router.delete("/:id", authenticate, withRole(["admin", "devAdmin"]), devotionalsController.remove);

export default router;

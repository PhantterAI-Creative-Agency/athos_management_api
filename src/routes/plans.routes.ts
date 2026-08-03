import { Router } from "express";
import * as plansController from "../controllers/plans.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { createPlanSchema, listPlansQuerySchema, updatePlanSchema, upsertPlanProgressSchema } from "../interfaces/plan.interface";

const router = Router();

router.post("/", authenticate, withRole(["devAdmin"]), validate(createPlanSchema), plansController.create);

router.get("/", authenticate, validate(listPlansQuerySchema, "query"), plansController.list);

router.get("/:id", authenticate, plansController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["devAdmin"]),
  validate(updatePlanSchema),
  plansController.update,
);

router.delete("/:id", authenticate, withRole(["devAdmin"]), plansController.remove);

router.post(
  "/:id/progress",
  authenticate,
  validate(upsertPlanProgressSchema),
  plansController.upsertProgress,
);

export default router;

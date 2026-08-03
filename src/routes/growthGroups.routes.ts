import { Router } from "express";
import * as growthGroupsController from "../controllers/growthGroups.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import {
  createGrowthGroupSchema,
  listGrowthGroupsQuerySchema,
  updateGrowthGroupSchema,
} from "../interfaces/growthGroup.interface";

const router = Router();

router.post(
  "/",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(createGrowthGroupSchema),
  growthGroupsController.create,
);

router.get(
  "/",
  authenticate,
  validate(listGrowthGroupsQuerySchema, "query"),
  growthGroupsController.list,
);

router.get("/:id", authenticate, growthGroupsController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateGrowthGroupSchema),
  growthGroupsController.update,
);

router.delete("/:id", authenticate, withRole(["admin", "devAdmin"]), growthGroupsController.remove);

router.post("/:id/members/:userId", authenticate, growthGroupsController.addMember);

router.delete("/:id/members/:userId", authenticate, growthGroupsController.removeMember);

export default router;

import { Router } from "express";
import * as ministriesController from "../controllers/ministries.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import {
  addVolunteerSchema,
  createMinistrySchema,
  listMinistriesQuerySchema,
  updateMinistrySchema,
} from "../interfaces/ministry.interface";

const router = Router();

router.post(
  "/",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(createMinistrySchema),
  ministriesController.create,
);

router.get(
  "/",
  authenticate,
  validate(listMinistriesQuerySchema, "query"),
  ministriesController.list,
);

router.get("/:id", authenticate, ministriesController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateMinistrySchema),
  ministriesController.update,
);

router.delete("/:id", authenticate, withRole(["admin", "devAdmin"]), ministriesController.remove);

router.post(
  "/:id/volunteers",
  authenticate,
  validate(addVolunteerSchema),
  ministriesController.addVolunteer,
);

export default router;

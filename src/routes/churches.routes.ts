import { Router } from "express";
import * as churchesController from "../controllers/churches.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import {
  registerChurchSchema,
  searchChurchesQuerySchema,
  updateChurchSchema,
} from "../interfaces/church.interface";

const router = Router();

router.post("/", validate(registerChurchSchema), churchesController.register);

router.get("/search", validate(searchChurchesQuerySchema, "query"), churchesController.search);

router.get("/me", authenticate, churchesController.getMe);
router.patch(
  "/me",
  authenticate,
  withRole(["admin"]),
  validate(updateChurchSchema),
  churchesController.updateMe,
);

export default router;

import { Router } from "express";
import * as jinglesController from "../controllers/jingles.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { createJingleSchema, updateJingleSchema } from "../interfaces/jingle.interface";

const router = Router();

router.post("/", authenticate, withRole(["admin", "devAdmin"]), validate(createJingleSchema), jinglesController.create);

router.get("/", authenticate, jinglesController.list);

router.get("/:id", authenticate, jinglesController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateJingleSchema),
  jinglesController.update,
);

router.delete("/:id", authenticate, withRole(["admin", "devAdmin"]), jinglesController.remove);

export default router;

import { Router } from "express";
import * as mediaController from "../controllers/media.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { createMediaSchema, updateMediaSchema } from "../interfaces/media.interface";

const router = Router();

router.post("/", authenticate, withRole(["admin", "devAdmin"]), validate(createMediaSchema), mediaController.create);

router.post("/sync-youtube", authenticate, withRole(["admin", "devAdmin"]), mediaController.syncYoutube);

router.get("/", authenticate, mediaController.list);

router.get("/:id", authenticate, mediaController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateMediaSchema),
  mediaController.update,
);

router.delete("/:id", authenticate, withRole(["admin", "devAdmin"]), mediaController.remove);

export default router;

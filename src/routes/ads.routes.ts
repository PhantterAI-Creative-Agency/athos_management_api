import { Router } from "express";
import * as adsController from "../controllers/ads.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import {
  createAdSchema,
  listAdsPublicQuerySchema,
  updateAdSchema,
  updateAdsSettingsSchema,
} from "../interfaces/ad.interface";

const router = Router();

router.post("/", authenticate, withRole(["admin", "devAdmin"]), validate(createAdSchema), adsController.create);

router.get("/", authenticate, withRole(["admin", "devAdmin"]), adsController.list);

router.get("/random", authenticate, validate(listAdsPublicQuerySchema, "query"), adsController.random);

router.get("/settings", authenticate, withRole(["admin", "devAdmin"]), adsController.getSettings);

router.patch(
  "/settings",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateAdsSettingsSchema),
  adsController.updateSettings,
);

router.get("/:id", authenticate, withRole(["admin", "devAdmin"]), adsController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateAdSchema),
  adsController.update,
);

router.delete("/:id", authenticate, withRole(["admin", "devAdmin"]), adsController.remove);

router.post("/:id/click", authenticate, adsController.registerClick);

export default router;

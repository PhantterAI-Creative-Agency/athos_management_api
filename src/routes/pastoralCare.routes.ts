import { Router } from "express";
import * as pastoralCareController from "../controllers/pastoralCare.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { createPrayerCareRecipientSchema, updatePrayerCareRecipientSchema } from "../interfaces/pastoralCare.interface";

const router = Router();

const ADMIN_ROLES = ["admin", "devAdmin"] as const;
const LEADERSHIP_ROLES = [
  "admin",
  "devAdmin",
  "pastor",
  "seniorPastor",
  "elder",
  "deacon",
] as const;

router.get("/recipients", authenticate, withRole([...ADMIN_ROLES]), pastoralCareController.listRecipients);

router.post(
  "/recipients",
  authenticate,
  withRole([...ADMIN_ROLES]),
  validate(createPrayerCareRecipientSchema),
  pastoralCareController.addRecipient,
);

router.patch(
  "/recipients/:id",
  authenticate,
  withRole([...ADMIN_ROLES]),
  validate(updatePrayerCareRecipientSchema),
  pastoralCareController.updateRecipient,
);

router.get("/requests", authenticate, withRole([...LEADERSHIP_ROLES]), pastoralCareController.listRequests);

export default router;

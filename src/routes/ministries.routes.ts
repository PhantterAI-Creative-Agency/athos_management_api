import { Router } from "express";
import * as ministriesController from "../controllers/ministries.controller";
import * as ministrySchedulesController from "../controllers/ministrySchedules.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import {
  addVolunteerSchema,
  createMinistrySchema,
  listMinistriesQuerySchema,
  replaceServiceFunctionsSchema,
  updateMinistrySchema,
} from "../interfaces/ministry.interface";
import {
  createScheduleSchema,
  listSchedulesQuerySchema,
  updateScheduleSchema,
} from "../interfaces/ministrySchedule.interface";

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

router.get("/:id/volunteers", authenticate, ministriesController.listVolunteers);

router.get("/:id/service-functions", authenticate, ministriesController.getServiceFunctions);

router.put(
  "/:id/service-functions",
  authenticate,
  validate(replaceServiceFunctionsSchema),
  ministriesController.replaceServiceFunctions,
);

router.get(
  "/:id/schedules",
  authenticate,
  validate(listSchedulesQuerySchema, "query"),
  ministrySchedulesController.list,
);

router.get("/:id/schedules/:scheduleId", authenticate, ministrySchedulesController.getById);

router.post(
  "/:id/schedules",
  authenticate,
  validate(createScheduleSchema),
  ministrySchedulesController.create,
);

router.patch(
  "/:id/schedules/:scheduleId",
  authenticate,
  validate(updateScheduleSchema),
  ministrySchedulesController.update,
);

router.delete("/:id/schedules/:scheduleId", authenticate, ministrySchedulesController.remove);

export default router;

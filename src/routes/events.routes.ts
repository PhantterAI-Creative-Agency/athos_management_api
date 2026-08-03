import { Router } from "express";
import * as eventsController from "../controllers/events.controller";
import * as eventRegistrationsController from "../controllers/eventRegistrations.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { createEventSchema, listEventsQuerySchema, updateEventSchema } from "../interfaces/event.interface";
import {
  listEventRegistrationsQuerySchema,
  registerForEventSchema,
  updateEventRegistrationSchema,
} from "../interfaces/eventRegistration.interface";

const router = Router();

router.post(
  "/",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(createEventSchema),
  eventsController.create,
);

router.get("/", authenticate, validate(listEventsQuerySchema, "query"), eventsController.list);

router.get(
  "/registrations",
  authenticate,
  validate(listEventRegistrationsQuerySchema, "query"),
  eventRegistrationsController.listMine,
);

router.patch(
  "/registrations/:id",
  authenticate,
  validate(updateEventRegistrationSchema),
  eventRegistrationsController.update,
);

router.get("/:id", authenticate, eventsController.getById);

router.patch(
  "/:id",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(updateEventSchema),
  eventsController.update,
);

router.delete("/:id", authenticate, withRole(["admin", "devAdmin"]), eventsController.remove);

router.post(
  "/:id/register",
  authenticate,
  validate(registerForEventSchema),
  eventRegistrationsController.register,
);

export default router;

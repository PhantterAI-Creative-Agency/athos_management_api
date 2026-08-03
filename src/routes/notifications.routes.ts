import { Router } from "express";
import * as notificationsController from "../controllers/notifications.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { listNotificationsQuerySchema } from "../interfaces/notification.interface";

const router = Router();

router.get("/", authenticate, validate(listNotificationsQuerySchema, "query"), notificationsController.list);

router.patch("/read-all", authenticate, notificationsController.markAllRead);

router.patch("/:id/read", authenticate, notificationsController.markRead);

export default router;

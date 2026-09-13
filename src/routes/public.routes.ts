import { Router } from "express";
import * as publicController from "../controllers/public.controller";
import * as aiChatController from "../controllers/aiChat.controller";
import { validate } from "../middlewares/validate";
import { sendGuestChatMessageSchema } from "../interfaces/aiChat.interface";
import { trackPublicAccess } from "../middlewares/trackAccess";

const router = Router();

router.get("/churches/:slug", trackPublicAccess, publicController.getChurch);
router.get("/churches/:slug/events", trackPublicAccess, publicController.getEvents);
router.get("/churches/:slug/devotionals", trackPublicAccess, publicController.getDevotionals);
router.get("/churches/:slug/media", trackPublicAccess, publicController.getMedia);
router.get("/churches/:slug/ministries", trackPublicAccess, publicController.getMinistries);
router.post(
  "/churches/:slug/ai-chat/messages",
  validate(sendGuestChatMessageSchema),
  aiChatController.sendGuestMessage,
);

export default router;

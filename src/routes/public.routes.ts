import { Router } from "express";
import * as publicController from "../controllers/public.controller";
import * as aiChatController from "../controllers/aiChat.controller";
import { validate } from "../middlewares/validate";
import { sendGuestChatMessageSchema } from "../interfaces/aiChat.interface";

const router = Router();

router.get("/churches/:slug", publicController.getChurch);
router.get("/churches/:slug/events", publicController.getEvents);
router.get("/churches/:slug/devotionals", publicController.getDevotionals);
router.get("/churches/:slug/media", publicController.getMedia);
router.post(
  "/churches/:slug/ai-chat/messages",
  validate(sendGuestChatMessageSchema),
  aiChatController.sendGuestMessage,
);

export default router;

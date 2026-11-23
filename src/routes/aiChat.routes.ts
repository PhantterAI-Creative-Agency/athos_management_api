import { Router } from "express";
import * as aiChatController from "../controllers/aiChat.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { requireFeature } from "../middlewares/requireFeature";
import { sendChatMessageSchema } from "../interfaces/aiChat.interface";

const router = Router();

router.post("/messages", authenticate, requireFeature("aiAssistant"), validate(sendChatMessageSchema), aiChatController.sendMessage);

export default router;

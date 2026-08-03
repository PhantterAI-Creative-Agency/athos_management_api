import { Router } from "express";
import * as aiChatController from "../controllers/aiChat.controller";
import { authenticate } from "../middlewares/authenticate";
import { validate } from "../middlewares/validate";
import { sendChatMessageSchema } from "../interfaces/aiChat.interface";

const router = Router();

router.post("/messages", authenticate, validate(sendChatMessageSchema), aiChatController.sendMessage);

export default router;

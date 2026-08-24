import { Router } from "express";
import * as internalController from "../controllers/internal.controller";
import { mediaSyncLimiter } from "../middlewares/rateLimiter";

const router = Router();

router.get("/cron/media-youtube-sync", mediaSyncLimiter, internalController.syncYoutubeMedia);

export default router;

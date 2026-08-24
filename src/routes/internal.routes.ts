import { Router } from "express";
import * as internalController from "../controllers/internal.controller";

const router = Router();

router.get("/cron/media-youtube-sync", internalController.syncYoutubeMedia);

export default router;

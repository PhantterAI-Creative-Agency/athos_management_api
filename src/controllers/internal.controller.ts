import type { NextFunction, Request, Response } from "express";
import * as mediaService from "../services/media.service";
import { sendSuccess } from "../helpers/response.helper";
import { AppError } from "../middlewares/errorHandler";
import { env } from "../config/env";

export async function syncYoutubeMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.header("authorization");

    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      throw new AppError(401, "UNAUTHORIZED", "Não autorizado");
    }

    await mediaService.syncYoutubeVideosForAllChurches();
    sendSuccess(res, { synced: true });
  } catch (error) {
    next(error);
  }
}

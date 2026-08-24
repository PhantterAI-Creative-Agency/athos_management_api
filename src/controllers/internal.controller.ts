import type { NextFunction, Request, Response } from "express";
import * as mediaService from "../services/media.service";
import { sendSuccess } from "../helpers/response.helper";

export async function syncYoutubeMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await mediaService.syncYoutubeVideosForAllChurches();
    sendSuccess(res, { synced: true });
  } catch (error) {
    next(error);
  }
}

import type { NextFunction, Request, Response } from "express";
import * as bibleService from "../services/bible.service";
import { sendSuccess } from "../helpers/response.helper";
import type { BibleChapterParamsDTO, BibleChapterQueryDTO } from "../interfaces/bible.interface";

export async function getChapter(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = req.validated?.params as BibleChapterParamsDTO;
    const query = req.validated?.query as BibleChapterQueryDTO;
    const chapter = await bibleService.getChapter(query.version, params.book, params.chapter);
    sendSuccess(res, chapter);
  } catch (error) {
    next(error);
  }
}

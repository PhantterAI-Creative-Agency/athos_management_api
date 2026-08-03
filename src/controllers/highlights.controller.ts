import type { NextFunction, Request, Response } from "express";
import * as highlightsService from "../services/highlights.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateHighlightDTO, ListHighlightsQueryDTO } from "../interfaces/highlight.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateHighlightDTO;
    const highlight = await highlightsService.createHighlight(req.user!, body);
    await auditLog("CREATE", "Highlight", highlight.id, { book: body.book, chapter: body.chapter }, req);
    sendSuccess(res, highlight, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListHighlightsQueryDTO;
    const highlights = await highlightsService.listHighlights(req.user!, query);
    sendSuccess(res, highlights);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await highlightsService.deleteHighlight(req.user!, String(req.params.id));
    await auditLog("DELETE", "Highlight", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function toggleLike(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await highlightsService.toggleHighlightLike(req.user!, String(req.params.id));
    await auditLog("LIKE", "Highlight", String(req.params.id), { liked: result.liked }, req);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

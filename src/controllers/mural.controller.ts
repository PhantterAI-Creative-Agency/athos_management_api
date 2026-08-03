import type { NextFunction, Request, Response } from "express";
import * as muralService from "../services/mural.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateMuralPostDTO, ListMuralQueryDTO } from "../interfaces/mural.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateMuralPostDTO;
    const post = await muralService.createMuralPost(req.user!, body);
    await auditLog("CREATE", "MuralPost", post.id, { audience: body.audience }, req);
    sendSuccess(res, post, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListMuralQueryDTO;
    const feed = await muralService.listMural(req.user!, query);
    sendSuccess(res, feed);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await muralService.deleteMuralPost(req.user!, String(req.params.id));
    await auditLog("DELETE", "MuralPost", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function toggleLike(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await muralService.toggleMuralLike(req.user!, String(req.params.id));
    await auditLog("LIKE", "MuralPost", String(req.params.id), { liked: result.liked }, req);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

import type { NextFunction, Request, Response } from "express";
import * as followService from "../services/follow.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateFollowDTO, ListFollowsQueryDTO } from "../interfaces/follow.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateFollowDTO;
    const follow = await followService.createFollow(req.user!, body);
    await auditLog("CREATE", "Follow", follow.id, { followingId: body.followingId }, req);
    sendSuccess(res, follow, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListFollowsQueryDTO;
    const follows = await followService.listFollows(req.user!, query.type);
    sendSuccess(res, follows);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await followService.deleteFollow(req.user!, String(req.params.followingId));
    await auditLog("DELETE", "Follow", String(req.params.followingId), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

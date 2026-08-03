import type { NextFunction, Request, Response } from "express";
import * as friendsService from "../services/friends.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateFriendshipDTO, ListFriendsQueryDTO } from "../interfaces/friend.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateFriendshipDTO;
    const friendship = await friendsService.createFriendRequest(req.user!, body);
    await auditLog("CREATE", "Friendship", friendship.id, { friendId: body.friendId }, req);
    sendSuccess(res, friendship, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListFriendsQueryDTO;
    const friendships = await friendsService.listFriendships(req.user!, query.status);
    sendSuccess(res, friendships);
  } catch (error) {
    next(error);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const friendship = await friendsService.acceptFriendRequest(req.user!, String(req.params.id));
    await auditLog("UPDATE", "Friendship", friendship.id, { status: friendship.status }, req);
    sendSuccess(res, friendship);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await friendsService.deleteFriendship(req.user!, String(req.params.id));
    await auditLog("DELETE", "Friendship", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

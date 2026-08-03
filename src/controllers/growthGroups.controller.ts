import type { NextFunction, Request, Response } from "express";
import * as growthGroupsService from "../services/growthGroups.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  CreateGrowthGroupDTO,
  ListGrowthGroupsQueryDTO,
  UpdateGrowthGroupDTO,
} from "../interfaces/growthGroup.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateGrowthGroupDTO;
    const growthGroup = await growthGroupsService.createGrowthGroup(req.user!, body);
    await auditLog("CREATE", "GrowthGroup", growthGroup.id, { name: growthGroup.name }, req);
    sendSuccess(res, growthGroup, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListGrowthGroupsQueryDTO;
    const growthGroups = await growthGroupsService.listGrowthGroups(req.user!, query.mine === "true");
    sendSuccess(res, growthGroups);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const growthGroup = await growthGroupsService.getGrowthGroup(req.user!, String(req.params.id));
    sendSuccess(res, growthGroup);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateGrowthGroupDTO;
    const growthGroup = await growthGroupsService.updateGrowthGroup(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "GrowthGroup", growthGroup.id, { name: growthGroup.name }, req);
    sendSuccess(res, growthGroup);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await growthGroupsService.deleteGrowthGroup(req.user!, String(req.params.id));
    await auditLog("DELETE", "GrowthGroup", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const growthGroup = await growthGroupsService.addMember(
      req.user!,
      String(req.params.id),
      String(req.params.userId),
    );
    await auditLog("ADD_MEMBER", "GrowthGroup", String(req.params.id), { userId: String(req.params.userId) }, req);
    sendSuccess(res, growthGroup, 201);
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const growthGroup = await growthGroupsService.removeMember(
      req.user!,
      String(req.params.id),
      String(req.params.userId),
    );
    await auditLog("REMOVE_MEMBER", "GrowthGroup", String(req.params.id), { userId: String(req.params.userId) }, req);
    sendSuccess(res, growthGroup);
  } catch (error) {
    next(error);
  }
}

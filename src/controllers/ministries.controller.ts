import type { NextFunction, Request, Response } from "express";
import * as ministriesService from "../services/ministries.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  AddVolunteerDTO,
  CreateMinistryDTO,
  ListMinistriesQueryDTO,
  ReplaceServiceFunctionsDTO,
  UpdateMinistryDTO,
} from "../interfaces/ministry.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateMinistryDTO;
    const ministry = await ministriesService.createMinistry(req.user!, body);
    await auditLog("CREATE", "Ministry", ministry.id, { name: ministry.name }, req);
    sendSuccess(res, ministry, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListMinistriesQueryDTO;
    const ministries = await ministriesService.listMinistries(req.user!, query.highlightUserId);
    sendSuccess(res, ministries);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ministry = await ministriesService.getMinistry(req.user!, String(req.params.id));
    sendSuccess(res, ministry);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateMinistryDTO;
    const ministry = await ministriesService.updateMinistry(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "Ministry", ministry.id, { name: ministry.name }, req);
    sendSuccess(res, ministry);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ministriesService.deleteMinistry(req.user!, String(req.params.id));
    await auditLog("DELETE", "Ministry", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function addVolunteer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as AddVolunteerDTO;
    const volunteer = await ministriesService.addVolunteer(req.user!, String(req.params.id), body);
    await auditLog("ADD_MEMBER", "Ministry", String(req.params.id), { userId: volunteer.userId }, req);
    sendSuccess(res, volunteer, 201);
  } catch (error) {
    next(error);
  }
}

export async function listVolunteers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const volunteers = await ministriesService.listVolunteers(req.user!, String(req.params.id));
    sendSuccess(res, volunteers);
  } catch (error) {
    next(error);
  }
}

export async function getServiceFunctions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const functions = await ministriesService.getServiceFunctions(req.user!, String(req.params.id));
    sendSuccess(res, functions);
  } catch (error) {
    next(error);
  }
}

export async function replaceServiceFunctions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as ReplaceServiceFunctionsDTO;
    const functions = await ministriesService.replaceServiceFunctions(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "Ministry", String(req.params.id), { serviceFunctions: functions.length }, req);
    sendSuccess(res, functions);
  } catch (error) {
    next(error);
  }
}

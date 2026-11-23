import type { NextFunction, Request, Response } from "express";
import * as usersService from "../services/users.service";
import { exportPersonalData } from "../services/dataExport.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateChildDTO, CreateUserDTO, ListUsersQueryDTO, UpdateUserDTO } from "../interfaces/user.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateUserDTO;
    const user = await usersService.createUser(body);
    await auditLog("REGISTER", "User", user.id, { email: user.email, name: user.name }, req);
    sendSuccess(res, user, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListUsersQueryDTO;
    const users = await usersService.listUsers(req.user!, query.churchId);
    sendSuccess(res, users);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await usersService.getUser(req.user!, String(req.params.id));
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

export async function createChild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateChildDTO;
    const child = await usersService.createChild(req.user!, String(req.params.id), body);
    await auditLog("REGISTER", "User", child.id, { name: child.name }, req);
    sendSuccess(res, child, 201);
  } catch (error) {
    next(error);
  }
}

export async function removeInactive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await usersService.deleteInactiveUsers(req.user!);
    await auditLog("DELETE", "User", undefined, { deletedCount: result.deletedCount, filter: "active:false" }, req);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateUserDTO;
    const user = await usersService.updateUser(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "User", user.id, { roles: body.roles, name: body.name }, req);
    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

export async function exportMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await exportPersonalData(req.user!.sub);
    await auditLog("OTHER", "PersonalDataExport", req.user!.sub, undefined, req);
    res.setHeader("Content-Disposition", `attachment; filename="meus-dados-${data.generatedAt.slice(0, 10)}.json"`);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

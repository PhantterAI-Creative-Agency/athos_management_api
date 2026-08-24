import type { NextFunction, Request, Response } from "express";
import * as ministrySchedulesService from "../services/ministrySchedules.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  CreateScheduleDTO,
  ListSchedulesQueryDTO,
  UpdateScheduleDTO,
} from "../interfaces/ministrySchedule.interface";

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListSchedulesQueryDTO;
    const schedules = await ministrySchedulesService.listSchedules(req.user!, String(req.params.id), query);
    sendSuccess(res, schedules);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const schedule = await ministrySchedulesService.getSchedule(
      req.user!,
      String(req.params.id),
      String(req.params.scheduleId),
    );
    sendSuccess(res, schedule);
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateScheduleDTO;
    const schedule = await ministrySchedulesService.createSchedule(req.user!, String(req.params.id), body);
    await auditLog("CREATE", "MinistrySchedule", schedule.id, { date: schedule.date }, req);
    sendSuccess(res, schedule, 201);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateScheduleDTO;
    const schedule = await ministrySchedulesService.updateSchedule(
      req.user!,
      String(req.params.id),
      String(req.params.scheduleId),
      body,
    );
    await auditLog("UPDATE", "MinistrySchedule", schedule.id, { date: schedule.date }, req);
    sendSuccess(res, schedule);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ministrySchedulesService.deleteSchedule(
      req.user!,
      String(req.params.id),
      String(req.params.scheduleId),
    );
    await auditLog("DELETE", "MinistrySchedule", String(req.params.scheduleId), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

import type { NextFunction, Request, Response } from "express";
import * as eventsService from "../services/events.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreateEventDTO, ListEventsQueryDTO, UpdateEventDTO } from "../interfaces/event.interface";

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListEventsQueryDTO;
    const events = await eventsService.listEvents(req.user!.churchId, query);
    sendSuccess(res, events);
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateEventDTO;
    const event = await eventsService.createEvent(req.user!, body);
    await auditLog("CREATE", "Event", event.id, { title: event.title }, req);
    sendSuccess(res, event, 201);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await eventsService.getEvent(req.user!, String(req.params.id));
    sendSuccess(res, event);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateEventDTO;
    const event = await eventsService.updateEvent(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "Event", event.id, { title: event.title }, req);
    sendSuccess(res, event);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await eventsService.deleteEvent(req.user!, String(req.params.id));
    await auditLog("DELETE", "Event", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

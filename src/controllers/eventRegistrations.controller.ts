import type { NextFunction, Request, Response } from "express";
import * as eventRegistrationsService from "../services/eventRegistrations.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  ListEventRegistrationsQueryDTO,
  RegisterForEventDTO,
  UpdateEventRegistrationDTO,
} from "../interfaces/eventRegistration.interface";

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as RegisterForEventDTO;
    const registration = await eventRegistrationsService.registerForEvent(
      req.user!,
      String(req.params.id),
      body,
    );
    await auditLog("CREATE", "EventRegistration", registration.id, { eventId: String(req.params.id) }, req);
    sendSuccess(res, registration, 201);
  } catch (error) {
    next(error);
  }
}

export async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListEventRegistrationsQueryDTO;
    const registrations = await eventRegistrationsService.listMyEventRegistrations(req.user!, query);
    sendSuccess(res, registrations);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateEventRegistrationDTO;
    const registration = await eventRegistrationsService.updateEventRegistration(
      req.user!,
      String(req.params.id),
      body,
    );
    await auditLog("UPDATE", "EventRegistration", registration.id, { status: body.status }, req);
    sendSuccess(res, registration);
  } catch (error) {
    next(error);
  }
}

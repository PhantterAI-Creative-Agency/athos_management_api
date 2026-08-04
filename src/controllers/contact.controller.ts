import type { NextFunction, Request, Response } from "express";
import * as contactService from "../services/contact.service";
import { sendSuccess } from "../helpers/response.helper";
import type { CreateContactMessageDTO } from "../interfaces/contact.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateContactMessageDTO;
    const contactMessage = await contactService.createContactMessage(body);
    sendSuccess(res, contactMessage, 201);
  } catch (error) {
    next(error);
  }
}

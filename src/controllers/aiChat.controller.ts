import type { NextFunction, Request, Response } from "express";
import * as aiChatService from "../services/aiChat.service";
import * as churchesService from "../services/churches.service";
import { sendSuccess } from "../helpers/response.helper";
import type { SendChatMessageDTO, SendGuestChatMessageDTO } from "../interfaces/aiChat.interface";

export async function sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as SendChatMessageDTO;
    const reply = await aiChatService.sendChatMessage({
      churchId: req.user!.churchId,
      sessionId: body.sessionId,
      message: body.message,
      requester: req.user!,
    });
    sendSuccess(res, reply);
  } catch (error) {
    next(error);
  }
}

export async function sendGuestMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as SendGuestChatMessageDTO;
    const church = await churchesService.getChurchBySlug(String(req.params.slug));
    const reply = await aiChatService.sendChatMessage({
      churchId: church.id,
      sessionId: body.sessionId,
      message: body.message,
      guestName: body.guestName,
      guestWhatsapp: body.guestWhatsapp,
    });
    sendSuccess(res, reply);
  } catch (error) {
    next(error);
  }
}

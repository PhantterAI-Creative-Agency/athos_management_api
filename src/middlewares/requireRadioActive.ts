import type { NextFunction, Request, Response } from "express";
import { sendError } from "../helpers/response.helper";
import { isRadioActive } from "../services/radioActivation.service";

/** Rotas de gestão da rádio: exigem rádio ligada e termo de responsabilidade aceito. */
export async function requireRadioActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Usuário não autenticado");
      return;
    }
    if (!(await isRadioActive(req.user.churchId))) {
      sendError(
        res,
        403,
        "RADIO_INACTIVE",
        "A rádio está desativada. Ative-a no painel aceitando o termo de responsabilidade sobre direitos autorais.",
      );
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

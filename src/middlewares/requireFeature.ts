import type { NextFunction, Request, Response } from "express";
import { Church } from "../models/Church.model";
import { sendError } from "../helpers/response.helper";
import { resolveFeatures, type ChurchFeature } from "../helpers/features.helper";

const DISABLED_MESSAGES: Record<ChurchFeature, string> = {
  radio: "A rádio não está ativada para esta igreja",
  ads: "Os anúncios não estão ativados para esta igreja",
  aiAssistant: "O assistente com IA não está ativado para esta igreja",
  onlineOfferings: "As ofertas on-line não estão ativadas para esta igreja",
};

/** Bloqueia a rota quando o recurso está desligado para a igreja do usuário. Use após `authenticate`. */
export function requireFeature(feature: ChurchFeature) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        sendError(res, 401, "UNAUTHORIZED", "Usuário não autenticado");
        return;
      }

      const church = await Church.findById(req.user.churchId).select("settings").lean();
      if (!church) {
        sendError(res, 404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
        return;
      }

      if (!resolveFeatures(church.settings)[feature]) {
        sendError(res, 403, "FEATURE_DISABLED", DISABLED_MESSAGES[feature]);
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

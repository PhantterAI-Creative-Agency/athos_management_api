import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, type AuthTokenPayload } from "../helpers/jwt.helper";
import { sendError } from "../helpers/response.helper";
import { getBillingState } from "../helpers/plans.helper";
import { Church } from "../models/Church.model";

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
    }
  }
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Mesmo em modo somente leitura a igreja pode: regularizar a assinatura, sair/trocar senha,
// aceitar documentos e exercer direitos de titular (exportar/excluir dados).
const READ_ONLY_ALLOWED = [/^\/athos_adm\/api\/billing\//, /^\/athos_adm\/api\/auth\//, /^\/athos_adm\/api\/legal\//, /^\/athos_adm\/api\/data-deletion-requests/];

/**
 * Inadimplência depois da carência deixa a igreja em modo somente leitura (URS-COB-04): tudo
 * continua visível, mas alterações são recusadas até o pagamento. Nenhum dado é apagado.
 */
async function isReadOnly(req: Request, user: AuthTokenPayload): Promise<boolean> {
  if (READ_METHODS.has(req.method) || user.roles.includes("devAdmin")) return false;
  const path = req.originalUrl.split("?")[0];
  if (READ_ONLY_ALLOWED.some((pattern) => pattern.test(path))) return false;
  const church = await Church.findById(user.churchId).select("subscription").lean();
  return getBillingState(church?.subscription).access === "read_only";
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    sendError(res, 401, "UNAUTHORIZED", "Token de acesso ausente");
    return;
  }

  const token = header.slice("Bearer ".length);

  let user: AuthTokenPayload;
  try {
    user = verifyAccessToken(token);
  } catch {
    sendError(res, 401, "UNAUTHORIZED", "Token de acesso inválido ou expirado");
    return;
  }

  req.user = user;
  isReadOnly(req, user)
    .then((readOnly) => {
      if (readOnly) {
        sendError(
          res,
          402,
          "SUBSCRIPTION_READ_ONLY",
          "A mensalidade da igreja está em atraso. O acesso está em modo somente leitura até o pagamento.",
        );
        return;
      }
      next();
    })
    .catch(next);
}

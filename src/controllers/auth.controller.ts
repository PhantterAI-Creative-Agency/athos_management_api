import type { NextFunction, Request, Response } from "express";
import * as authService from "../services/auth.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { LoginDTO, RefreshDTO } from "../interfaces/auth.interface";

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.validated?.body as LoginDTO;
    const result = await authService.login(email, password);
    await auditLog("LOGIN", "User", result.user.id, { email: result.user.email }, req);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.validated?.body as RefreshDTO;
    const result = await authService.refresh(refreshToken);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function oauth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.oauthLogin(String(req.params.provider));
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logout(req.user!.sub);
    await auditLog("LOGOUT", "User", req.user!.sub, undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

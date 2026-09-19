import type { NextFunction, Request, Response } from "express";
import * as authService from "../services/auth.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  ForgotPasswordDTO,
  LoginDTO,
  RefreshDTO,
  RegisterDTO,
  ResetPasswordDTO,
  ChangePasswordDTO,
} from "../interfaces/auth.interface";

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as RegisterDTO;
    const userId = await authService.register(body);
    await auditLog("REGISTER", "User", userId, { email: body.email }, req);
    sendSuccess(
      res,
      { message: "Cadastro recebido! Sua conta ficará ativa após a aprovação de um administrador." },
      201,
    );
  } catch (error) {
    next(error);
  }
}

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

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.validated?.body as ForgotPasswordDTO;
    await authService.requestPasswordReset(email);
    // Resposta idêntica exista ou não o e-mail, para não permitir enumeração de contas.
    sendSuccess(res, { message: "Se o e-mail estiver cadastrado, você receberá um código em instantes." });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, code, password } = req.validated?.body as ResetPasswordDTO;
    const userId = await authService.resetPassword(email, code, password);
    await auditLog("UPDATE", "User", userId, { field: "password" }, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { password } = req.validated?.body as ChangePasswordDTO;
    await authService.changePassword(req.user!.sub, password);
    await auditLog("UPDATE", "User", req.user!.sub, { field: "password" }, req);
    res.status(204).end();
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

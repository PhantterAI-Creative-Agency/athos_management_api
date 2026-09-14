import type { NextFunction, Request, Response } from "express";
import * as dashboardService from "../services/dashboard.service";
import { sendSuccess } from "../helpers/response.helper";

export async function getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const summary = await dashboardService.getDashboardSummary(req.user!.churchId);
    sendSuccess(res, summary);
  } catch (error) {
    next(error);
  }
}

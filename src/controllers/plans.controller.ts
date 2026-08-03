import type { NextFunction, Request, Response } from "express";
import * as plansService from "../services/plans.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type { CreatePlanDTO, ListPlansQueryDTO, UpdatePlanDTO, UpsertPlanProgressDTO } from "../interfaces/plan.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreatePlanDTO;
    const plan = await plansService.createPlan(body);
    await auditLog("CREATE", "BiblePlan", plan.id, { title: plan.title }, req);
    sendSuccess(res, plan, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = (req.validated?.query as ListPlansQueryDTO) ?? {};
    const plans = await plansService.listPlans(req.user!, query);
    sendSuccess(res, plans);
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plan = await plansService.getPlan(req.user!, String(req.params.id));
    sendSuccess(res, plan);
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdatePlanDTO;
    const plan = await plansService.updatePlan(String(req.params.id), body);
    await auditLog("UPDATE", "BiblePlan", plan.id, { title: plan.title }, req);
    sendSuccess(res, plan);
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await plansService.deletePlan(String(req.params.id));
    await auditLog("DELETE", "BiblePlan", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function upsertProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.validated?.body as UpsertPlanProgressDTO) ?? {};
    const progress = await plansService.upsertPlanProgress(req.user!, String(req.params.id), body);
    await auditLog("OTHER", "PlanProgress", progress.id, { planId: String(req.params.id) }, req);
    sendSuccess(res, progress, 201);
  } catch (error) {
    next(error);
  }
}

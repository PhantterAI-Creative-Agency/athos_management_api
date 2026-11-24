import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import * as platformService from "../services/platform.service";
import * as billingService from "../services/billing.service";
import { PLAN_IDS } from "../helpers/plans.helper";

// Painel da plataforma (equipe Athos): implantação de igrejas e acompanhamento de uso/custo.
const router = Router();
router.use(authenticate, withRole(["devAdmin"]));

const domainList = z.array(z.string().trim().min(3).max(253)).max(10);

const createChurchSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da igreja").max(120),
  slug: z.string().trim().max(60).optional(),
  logoUrl: z.string().trim().max(2_000_000).optional(),
  domains: domainList.optional(),
  storageMb: z.number().int().positive().max(1_000_000).optional(),
  plan: z.enum(PLAN_IDS).optional(),
  exempt: z.boolean().optional(),
  admin: z.object({
    name: z.string().trim().min(2, "Informe o nome do administrador").max(120),
    email: z.string().trim().email("E-mail do administrador inválido"),
  }),
});

const updateChurchSchema = z.object({
  domains: domainList.optional(),
  storageMb: z.number().int().positive().max(1_000_000).nullable().optional(),
});

router.get("/churches", async (_req, res, next) => {
  try {
    sendSuccess(res, await platformService.listPlatformChurches());
  } catch (error) {
    next(error);
  }
});

router.post("/churches", validate(createChurchSchema), async (req, res, next) => {
  try {
    const body = req.validated?.body as z.infer<typeof createChurchSchema>;
    const result = await platformService.createChurchWithAdmin(body);
    await auditLog("CREATE", "Church", result.church.id, { slug: result.church.slug, adminId: result.adminId }, req);
    sendSuccess(res, result, 201);
  } catch (error) {
    next(error);
  }
});

router.patch("/churches/:id", validate(updateChurchSchema), async (req, res, next) => {
  try {
    const body = req.validated?.body as z.infer<typeof updateChurchSchema>;
    const church = await platformService.updatePlatformChurch(String(req.params.id), body);
    await auditLog("UPDATE", "Church", church.id, { fields: Object.keys(body) }, req);
    sendSuccess(res, church);
  } catch (error) {
    next(error);
  }
});

const billingSchema = z.object({
  plan: z.enum(PLAN_IDS).optional(),
  exempt: z.boolean().optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
});

// Plano, isenção (ex.: igreja-piloto) e prazo de teste.
router.patch("/churches/:id/billing", validate(billingSchema), async (req, res, next) => {
  try {
    const body = req.validated?.body as z.infer<typeof billingSchema>;
    const result = await billingService.setChurchBilling(String(req.params.id), body);
    await auditLog("UPDATE", "Subscription", String(req.params.id), { ...body }, req);
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
});

const setupFeeSchema = z.object({
  value: z.number().positive().max(100_000),
  dueDate: z.coerce.date().optional(),
});

// Taxa de implantação (cobrança única no Asaas).
router.post("/churches/:id/setup-fee", validate(setupFeeSchema), async (req, res, next) => {
  try {
    const body = req.validated?.body as z.infer<typeof setupFeeSchema>;
    const invoice = await billingService.chargeSetupFee(String(req.params.id), body.value, body.dueDate ?? new Date(Date.now() + 3 * 86_400_000));
    await auditLog("CREATE", "BillingInvoice", invoice.id, { kind: "setup", value: body.value }, req);
    sendSuccess(res, invoice, 201);
  } catch (error) {
    next(error);
  }
});

router.get("/churches/:id/usage", async (req, res, next) => {
  try {
    sendSuccess(res, await platformService.getChurchUsage(String(req.params.id)));
  } catch (error) {
    next(error);
  }
});

export default router;

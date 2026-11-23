import { Router } from "express";
import * as legalController from "../controllers/legal.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import {
  acceptLegalDocumentSchema,
  exportEvidenceQuerySchema,
  getCurrentLegalDocumentQuerySchema,
  legalTypeParamSchema,
  listLegalDocumentsQuerySchema,
  publishLegalDocumentSchema,
  revokeLegalDocumentSchema,
} from "../interfaces/legal.interface";

const router = Router();
// Documentos legais são da plataforma (globais), então só a equipe Athos publica.
const platformOnly = withRole(["devAdmin"]);

// Documentos que o usuário logado ainda precisa aceitar (Termos, Política e, para o admin,
// Contrato/DPA da igreja).
router.get("/pending", authenticate, legalController.pending);

router.get(
  "/documents",
  authenticate,
  platformOnly,
  validate(listLegalDocumentsQuerySchema, "query"),
  legalController.list,
);
router.post("/documents", authenticate, platformOnly, validate(publishLegalDocumentSchema), legalController.publish);

// Evidência completa dos aceites da igreja (JSON para download).
router.get(
  "/evidence",
  authenticate,
  withRole(["admin", "devAdmin"]),
  validate(exportEvidenceQuerySchema, "query"),
  legalController.evidence,
);

// Público: site e app exibem Termos/Política antes do login, já com o nome da igreja.
router.get(
  "/:type/current",
  validate(legalTypeParamSchema, "params"),
  validate(getCurrentLegalDocumentQuerySchema, "query"),
  legalController.getCurrent,
);

router.post(
  "/:type/accept",
  authenticate,
  validate(legalTypeParamSchema, "params"),
  validate(acceptLegalDocumentSchema),
  legalController.accept,
);

router.post(
  "/:type/revoke",
  authenticate,
  validate(legalTypeParamSchema, "params"),
  validate(revokeLegalDocumentSchema),
  legalController.revoke,
);

export default router;

import { Router } from "express";
import * as churchesController from "../controllers/churches.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { trackAuthenticatedAccess } from "../middlewares/trackAccess";
import {
  registerChurchSchema,
  searchChurchesQuerySchema,
  updateChurchFeaturesSchema,
  updateChurchThemeSchema,
  updateChurchSchema,
} from "../interfaces/church.interface";
import { setPixConfigSchema } from "../interfaces/pix.interface";

const router = Router();

// Criação de igreja só pela equipe da plataforma (antes era pública e qualquer pessoa podia criar).
router.post("/", authenticate, withRole(["devAdmin"]), validate(registerChurchSchema), churchesController.register);

router.get("/search", validate(searchChurchesQuerySchema, "query"), churchesController.search);

router.get("/me", authenticate, trackAuthenticatedAccess(), churchesController.getMe);
router.patch(
  "/me",
  authenticate,
  withRole(["admin"]),
  validate(updateChurchSchema),
  churchesController.updateMe,
);

// Recursos ligados/desligados para a igreja do usuário (rádio, anúncios, IA, ofertas on-line).
router.get("/me/features", authenticate, churchesController.getMyFeatures);
router.patch(
  "/me/features",
  authenticate,
  withRole(["admin"]),
  validate(updateChurchFeaturesSchema),
  churchesController.updateMyFeatures,
);

// Identidade visual do site (cores, fonte, favicon, ordem das seções da home).
router.put("/me/theme", authenticate, withRole(["admin"]), validate(updateChurchThemeSchema), churchesController.updateMyTheme);

// Chave PIX da igreja para ofertas (o dinheiro cai direto na conta da igreja).
router.get("/me/pix", authenticate, withRole(["admin"]), churchesController.getMyPix);
router.put("/me/pix", authenticate, withRole(["admin"]), validate(setPixConfigSchema), churchesController.setMyPix);
router.delete("/me/pix", authenticate, withRole(["admin"]), churchesController.removeMyPix);

// Dados gerais da igreja, identificados pelo slug (deve ser o da igreja do usuário logado)
router.get("/:slug", authenticate, trackAuthenticatedAccess(), churchesController.getBySlug);
router.patch(
  "/:slug",
  authenticate,
  withRole(["admin"]),
  validate(updateChurchSchema),
  churchesController.updateBySlug,
);

export default router;

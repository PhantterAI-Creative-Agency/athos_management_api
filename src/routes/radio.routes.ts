import { Router } from "express";
import * as radioController from "../controllers/radio.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
import { requireRadioActive } from "../middlewares/requireRadioActive";
import { getRequestEvidence } from "../helpers/requestEvidence.helper";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import * as radioActivation from "../services/radioActivation.service";
import { z } from "zod";
import {
  createRadioPlaylistSchema,
  listRadioTracksQuerySchema,
  reorderRadioPlaylistsSchema,
  updateRadioPlaylistSchema,
  updateRadioTrackSchema,
  uploadRadioTrackQuerySchema,
} from "../interfaces/radio.interface";

const router = Router();
const adminOnly = withRole(["admin", "devAdmin"]);
const churchAdmin = withRole(["admin"]);

const activateRadioSchema = z.object({
  version: z.number().int().positive(),
  contentHash: z.string().length(64),
});

// Ativação (termo de responsabilidade + flag) — antes do bloqueio das demais rotas.
router.get("/status", authenticate, adminOnly, async (req, res, next) => {
  try {
    sendSuccess(res, await radioActivation.getRadioStatus(req.user!.churchId));
  } catch (error) {
    next(error);
  }
});

router.post("/activate", authenticate, churchAdmin, validate(activateRadioSchema), async (req, res, next) => {
  try {
    const body = req.validated?.body as z.infer<typeof activateRadioSchema>;
    const status = await radioActivation.activateRadio(req.user!, body, getRequestEvidence(req));
    await auditLog("UPDATE", "ChurchFeatures", req.user!.churchId, { changes: { radio: true }, termsVersion: body.version }, req);
    sendSuccess(res, status);
  } catch (error) {
    next(error);
  }
});

router.post("/deactivate", authenticate, churchAdmin, async (req, res, next) => {
  try {
    const status = await radioActivation.deactivateRadio(req.user!.churchId);
    await auditLog("UPDATE", "ChurchFeatures", req.user!.churchId, { changes: { radio: false } }, req);
    sendSuccess(res, status);
  } catch (error) {
    next(error);
  }
});

// Demais rotas: só com a rádio ligada e o termo vigente aceito.
router.use(authenticate, requireRadioActive);

router.get("/tracks", authenticate, adminOnly, validate(listRadioTracksQuerySchema, "query"), radioController.listTracks);

// Corpo bruto do arquivo de áudio; nome original no header X-File-Name (URI-encoded).
router.post(
  "/tracks/upload",
  authenticate,
  adminOnly,
  validate(uploadRadioTrackQuerySchema, "query"),
  radioController.uploadTrack,
);

router.patch("/tracks/:id", authenticate, adminOnly, validate(updateRadioTrackSchema), radioController.updateTrack);

router.delete("/tracks/:id", authenticate, adminOnly, radioController.removeTrack);

router.get("/playlists", authenticate, adminOnly, radioController.listPlaylists);

router.post("/playlists", authenticate, adminOnly, validate(createRadioPlaylistSchema), radioController.createPlaylist);

router.put(
  "/playlists/order",
  authenticate,
  adminOnly,
  validate(reorderRadioPlaylistsSchema),
  radioController.reorderPlaylists,
);

router.get("/playlists/:id", authenticate, adminOnly, radioController.getPlaylist);

router.patch(
  "/playlists/:id",
  authenticate,
  adminOnly,
  validate(updateRadioPlaylistSchema),
  radioController.updatePlaylist,
);

router.delete("/playlists/:id", authenticate, adminOnly, radioController.removePlaylist);

export default router;

import { Router } from "express";
import * as radioController from "../controllers/radio.controller";
import { authenticate } from "../middlewares/authenticate";
import { withRole } from "../middlewares/rbac";
import { validate } from "../middlewares/validate";
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

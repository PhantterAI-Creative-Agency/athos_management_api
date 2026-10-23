import type { NextFunction, Request, Response } from "express";
import * as radioService from "../services/radio.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  CreateRadioPlaylistDTO,
  ListRadioTracksQueryDTO,
  ReorderRadioPlaylistsDTO,
  UpdateRadioPlaylistDTO,
  UpdateRadioTrackDTO,
  UploadRadioTrackQueryDTO,
} from "../interfaces/radio.interface";

export async function uploadTrack(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as UploadRadioTrackQueryDTO;
    const track = await radioService.uploadTrack(req.user!, req, query);
    await auditLog("CREATE", "RadioTrack", track.id, { title: track.title, type: track.type }, req);
    sendSuccess(res, track, 201);
  } catch (error) {
    next(error);
  }
}

export async function listTracks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListRadioTracksQueryDTO;
    const tracks = await radioService.listTracks(req.user!, query);
    sendSuccess(res, tracks);
  } catch (error) {
    next(error);
  }
}

export async function updateTrack(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateRadioTrackDTO;
    const track = await radioService.updateTrack(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "RadioTrack", track.id, { title: track.title }, req);
    sendSuccess(res, track);
  } catch (error) {
    next(error);
  }
}

export async function removeTrack(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await radioService.deleteTrack(req.user!, String(req.params.id));
    await auditLog("DELETE", "RadioTrack", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function createPlaylist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateRadioPlaylistDTO;
    const playlist = await radioService.createPlaylist(req.user!, body);
    await auditLog("CREATE", "RadioPlaylist", playlist.id, { name: playlist.name }, req);
    sendSuccess(res, playlist, 201);
  } catch (error) {
    next(error);
  }
}

export async function listPlaylists(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const playlists = await radioService.listPlaylists(req.user!);
    sendSuccess(res, playlists);
  } catch (error) {
    next(error);
  }
}

export async function getPlaylist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const playlist = await radioService.getPlaylist(req.user!, String(req.params.id));
    sendSuccess(res, playlist);
  } catch (error) {
    next(error);
  }
}

export async function updatePlaylist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as UpdateRadioPlaylistDTO;
    const playlist = await radioService.updatePlaylist(req.user!, String(req.params.id), body);
    await auditLog("UPDATE", "RadioPlaylist", playlist.id, { name: playlist.name }, req);
    sendSuccess(res, playlist);
  } catch (error) {
    next(error);
  }
}

export async function reorderPlaylists(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as ReorderRadioPlaylistsDTO;
    const playlists = await radioService.reorderPlaylists(req.user!, body);
    await auditLog("UPDATE", "RadioPlaylist", undefined, { reorder: body.ids }, req);
    sendSuccess(res, playlists);
  } catch (error) {
    next(error);
  }
}

export async function removePlaylist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await radioService.deletePlaylist(req.user!, String(req.params.id));
    await auditLog("DELETE", "RadioPlaylist", String(req.params.id), undefined, req);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

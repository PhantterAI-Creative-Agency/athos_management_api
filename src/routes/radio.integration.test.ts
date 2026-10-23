import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let mongod: MongoMemoryServer;
let app: Express;
let uploadDir: string;
let accessToken: string;
let otherChurchAccessToken: string;
let churchId: string;
let churchSlug: string;
let musicId: string;
let jingleId: string;
let otherChurchTrackId: string;
let playlistAId: string;
let playlistBId: string;

const API = "/athos_adm/api";
const HOUR = 60 * 60 * 1000;

function uploadAudio(token: string, type: string, fileName: string, body = Buffer.from("ID3fake-audio-bytes")) {
  return request(app)
    .post(`${API}/radio/tracks/upload?type=${type}&duration=180`)
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "audio/mpeg")
    .set("X-File-Name", encodeURIComponent(fileName))
    .send(body);
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  uploadDir = mkdtempSync(path.join(os.tmpdir(), "radio-uploads-"));
  process.env.UPLOAD_DIR = uploadDir;

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { hashPassword } = await import("../helpers/password.helper");
  const { signAccessToken } = await import("../helpers/jwt.helper");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();

  const church = await Church.create({
    name: "Igreja Teste",
    logoUrl: "https://example.com/logo.png",
    slug: "igreja-teste",
    settings: { primaryColor: "#123456" },
  });
  churchId = String(church._id);
  churchSlug = church.slug;

  const otherChurch = await Church.create({
    name: "Outra Igreja",
    logoUrl: "https://example.com/logo2.png",
    slug: "outra-igreja",
    settings: { primaryColor: "#654321" },
  });

  const admin = await User.create({
    churchId: church._id,
    name: "Admin Teste",
    email: "admin@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const otherAdmin = await User.create({
    churchId: otherChurch._id,
    name: "Admin Outra Igreja",
    email: "admin2@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  accessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
  otherChurchAccessToken = signAccessToken({
    sub: String(otherAdmin._id),
    churchId: String(otherChurch._id),
    roles: ["admin"],
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  rmSync(uploadDir, { recursive: true, force: true });
});

describe("Radio tracks", () => {
  it("faz upload de música e de vinheta", async () => {
    const music = await uploadAudio(accessToken, "music", "Louvor Áurea.mp3");
    expect(music.status).toBe(201);
    expect(music.body.data.type).toBe("music");
    expect(music.body.data.title).toBe("Louvor Áurea");
    expect(music.body.data.durationSec).toBe(180);
    expect(music.body.data.url).toMatch(/^\/uploads\/radio\/.+\.mp3$/);
    musicId = music.body.data.id;

    const jingle = await uploadAudio(accessToken, "jingle", "vinheta.mp3");
    expect(jingle.status).toBe(201);
    jingleId = jingle.body.data.id;

    const other = await uploadAudio(otherChurchAccessToken, "music", "outra.mp3");
    otherChurchTrackId = other.body.data.id;
  });

  it("serve o arquivo enviado com CORP cross-origin", async () => {
    const list = await request(app).get(`${API}/radio/tracks?type=music`).set("Authorization", `Bearer ${accessToken}`);
    const res = await request(app).get(`${API}${list.body.data[0].url}`);
    expect(res.status).toBe(200);
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("rejeita formato inválido", async () => {
    const res = await uploadAudio(accessToken, "music", "documento.pdf");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_AUDIO_FORMAT");
  });

  it("filtra por tipo e isola por igreja", async () => {
    const music = await request(app).get(`${API}/radio/tracks?type=music`).set("Authorization", `Bearer ${accessToken}`);
    expect(music.body.data).toHaveLength(1);

    const all = await request(app).get(`${API}/radio/tracks`).set("Authorization", `Bearer ${accessToken}`);
    expect(all.body.data).toHaveLength(2);
  });

  it("renomeia um áudio", async () => {
    const res = await request(app)
      .patch(`${API}/radio/tracks/${musicId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ title: "Novo título", artist: "Ministério de Louvor" });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Novo título");
    expect(res.body.data.artist).toBe("Ministério de Louvor");
  });
});

describe("Radio playlists", () => {
  it("cria playlist com músicas e vinhetas na ordem informada", async () => {
    const res = await request(app)
      .post(`${API}/radio/playlists`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Manhã", trackIds: [jingleId, musicId, jingleId, musicId] });
    expect(res.status).toBe(201);
    expect(res.body.data.items.map((item: { track: { id: string } }) => item.track.id)).toEqual([
      jingleId,
      musicId,
      jingleId,
      musicId,
    ]);
    expect(res.body.data.order).toBe(0);
    playlistAId = res.body.data.id;
  });

  it("rejeita áudio de outra igreja", async () => {
    const res = await request(app)
      .post(`${API}/radio/playlists`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Inválida", trackIds: [otherChurchTrackId] });
    expect(res.status).toBe(400);
  });

  it("rejeita período com término antes do início", async () => {
    const res = await request(app)
      .post(`${API}/radio/playlists`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        name: "Inválida",
        startsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
        endsAt: new Date(Date.now() + HOUR).toISOString(),
      });
    expect(res.status).toBe(400);
  });

  it("reordena playlists", async () => {
    const created = await request(app)
      .post(`${API}/radio/playlists`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Noite", trackIds: [musicId] });
    playlistBId = created.body.data.id;
    expect(created.body.data.order).toBe(1);

    const res = await request(app)
      .put(`${API}/radio/playlists/order`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ids: [playlistBId, playlistAId] });
    expect(res.status).toBe(200);
    expect(res.body.data.map((playlist: { id: string }) => playlist.id)).toEqual([playlistBId, playlistAId]);
  });

  it("não permite acessar playlist de outra igreja", async () => {
    const res = await request(app)
      .get(`${API}/radio/playlists/${playlistAId}`)
      .set("Authorization", `Bearer ${otherChurchAccessToken}`);
    expect(res.status).toBe(404);
  });

  it("rota pública devolve só as playlists no ar, na ordem, e a próxima mudança", async () => {
    const startsAt = new Date(Date.now() + HOUR).toISOString();
    await request(app)
      .post(`${API}/radio/playlists`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Futura", trackIds: [musicId], startsAt });

    const res = await request(app).get(`${API}/public/churches/${churchSlug}/radio`);
    expect(res.status).toBe(200);
    expect(res.body.data.playlists.map((playlist: { id: string }) => playlist.id)).toEqual([playlistBId, playlistAId]);
    expect(res.body.data.nextChangeAt).toBe(startsAt);
  });

  it("excluir áudio remove dos itens das playlists e apaga o arquivo", async () => {
    const before = await request(app).get(`${API}/radio/tracks?type=jingle`).set("Authorization", `Bearer ${accessToken}`);
    const filePath = path.join(uploadDir, before.body.data[0].url.replace(/^\/uploads\//, ""));
    expect(existsSync(filePath)).toBe(true);

    const res = await request(app).delete(`${API}/radio/tracks/${jingleId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
    expect(existsSync(filePath)).toBe(false);

    const playlist = await request(app)
      .get(`${API}/radio/playlists/${playlistAId}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(playlist.body.data.items).toHaveLength(2);
  });
});

describe("Migração das vinhetas antigas", () => {
  it("converte vinhetas em áudios e cria playlist com as ativas", async () => {
    const { Jingle } = await import("../models/Jingle.model");
    const { Church } = await import("../models/Church.model");
    const { RadioTrack } = await import("../models/RadioTrack.model");
    const { RadioPlaylist } = await import("../models/RadioPlaylist.model");
    const { migrateLegacyJingles } = await import("../services/radio.service");

    const church = await Church.create({
      name: "Igreja Legada",
      logoUrl: "https://example.com/logo3.png",
      slug: "igreja-legada",
      settings: { primaryColor: "#000000" },
    });
    await Jingle.create([
      { churchId: church._id, title: "B", url: "https://cdn.example.com/b.mp3", order: 2 },
      { churchId: church._id, title: "A", url: "https://cdn.example.com/a.mp3", order: 1 },
      { churchId: church._id, title: "Inativa", url: "https://cdn.example.com/c.mp3", order: 3, active: false },
    ]);

    await migrateLegacyJingles();

    expect(await Jingle.countDocuments()).toBe(0);
    expect(await RadioTrack.countDocuments({ churchId: church._id, type: "jingle" })).toBe(3);
    const playlist = await RadioPlaylist.findOne({ churchId: church._id });
    const tracks = await RadioTrack.find({ _id: { $in: playlist!.items.map((item) => item.trackId) } });
    const titlesById = new Map(tracks.map((track) => [String(track._id), track.title]));
    expect(playlist!.items.map((item) => titlesById.get(String(item.trackId)))).toEqual(["A", "B"]);
  });
});

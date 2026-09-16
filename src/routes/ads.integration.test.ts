import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let accessToken: string;
let otherChurchAccessToken: string;
let churchSlug: string;
let activeCardAdId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Ad } = await import("../models/Ad.model");
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

  accessToken = signAccessToken({ sub: String(admin._id), churchId: String(church._id), roles: ["admin"] });
  otherChurchAccessToken = signAccessToken({
    sub: String(otherAdmin._id),
    churchId: String(otherChurch._id),
    roles: ["admin"],
  });

  const activeCardAd = await Ad.create({
    churchId: church._id,
    format: "card",
    placement: "home_grid",
    title: "Anúncio Card Ativo",
    imageUrl: "https://example.com/ad-card.png",
    active: true,
  });
  activeCardAdId = String(activeCardAd._id);

  await Ad.create({
    churchId: church._id,
    format: "card",
    placement: "home_grid",
    title: "Anúncio Card Inativo",
    imageUrl: "https://example.com/ad-card-2.png",
    active: false,
  });

  await Ad.create({
    churchId: church._id,
    format: "slide",
    placement: "home_hero",
    title: "Anúncio Expirado",
    imageUrl: "https://example.com/ad-slide.png",
    active: true,
    endDate: new Date(Date.now() - 86_400_000),
  });

  await Ad.create({
    churchId: otherChurch._id,
    format: "card",
    placement: "home_grid",
    title: "Anúncio de Outra Igreja",
    imageUrl: "https://example.com/ad-card-3.png",
    active: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /athos_adm/api/ads", () => {
  it("rejeita requisição sem token", async () => {
    const response = await request(app).get("/athos_adm/api/ads");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it("lista apenas os anúncios da igreja do usuário autenticado", async () => {
    const response = await request(app).get("/athos_adm/api/ads").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(
      response.body.data.every((ad: { title: string }) => ad.title !== "Anúncio de Outra Igreja"),
    ).toBe(true);
  });

  it("isola anúncios por igreja para outro usuário", async () => {
    const response = await request(app)
      .get("/athos_adm/api/ads")
      .set("Authorization", `Bearer ${otherChurchAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toBe("Anúncio de Outra Igreja");
  });
});

describe("GET /athos_adm/api/ads/random", () => {
  it("retorna apenas anúncios ativos e dentro do período vigente", async () => {
    const response = await request(app)
      .get("/athos_adm/api/ads/random?placement=home_grid&format=card")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(activeCardAdId);
  });

  it("não retorna anúncio expirado", async () => {
    const response = await request(app)
      .get("/athos_adm/api/ads/random?placement=home_hero&format=slide")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
  });
});

describe("GET /athos_adm/api/public/churches/:slug/ads", () => {
  it("retorna anúncio ativo para visitante sem autenticação", async () => {
    const response = await request(app).get(
      `/athos_adm/api/public/churches/${churchSlug}/ads?placement=home_grid&format=card`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(activeCardAdId);
  });
});

describe("GET /athos_adm/api/ads/settings", () => {
  it("retorna as configurações de anúncios da igreja do usuário autenticado", async () => {
    const response = await request(app)
      .get("/athos_adm/api/ads/settings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ adsEnabled: true, disabledAdPlacements: [] });
  });
});

describe("PATCH /athos_adm/api/ads/settings", () => {
  it("atualiza a ativação global e as posições desativadas de anúncios", async () => {
    const response = await request(app)
      .patch("/athos_adm/api/ads/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ adsEnabled: false, disabledAdPlacements: ["home_grid"] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ adsEnabled: false, disabledAdPlacements: ["home_grid"] });

    const getResponse = await request(app)
      .get("/athos_adm/api/ads/settings")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getResponse.body.data).toEqual({ adsEnabled: false, disabledAdPlacements: ["home_grid"] });

    await request(app)
      .patch("/athos_adm/api/ads/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ adsEnabled: true, disabledAdPlacements: [] });
  });

  it("não altera as configurações de outra igreja", async () => {
    const response = await request(app)
      .get("/athos_adm/api/ads/settings")
      .set("Authorization", `Bearer ${otherChurchAccessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ adsEnabled: true, disabledAdPlacements: [] });
  });
});

describe("POST /athos_adm/api/ads/:id/click", () => {
  it("incrementa o contador de cliques do anúncio", async () => {
    const clickResponse = await request(app)
      .post(`/athos_adm/api/ads/${activeCardAdId}/click`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(clickResponse.status).toBe(204);

    const getResponse = await request(app)
      .get(`/athos_adm/api/ads/${activeCardAdId}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(getResponse.body.data.clicks).toBe(1);
  });
});

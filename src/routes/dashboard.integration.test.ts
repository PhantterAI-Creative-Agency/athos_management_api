import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import mongoose from "mongoose";
import type { Express } from "express";

let mongod: MongoMemoryServer;
let app: Express;
let churchId: string;
let ministryId: string;
let memberAccessToken: string;
let adminAccessToken: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  const { createApp } = await import("../app");
  const { connectDB } = await import("../config/mongoose");
  const { User } = await import("../models/User.model");
  const { Church } = await import("../models/Church.model");
  const { Event } = await import("../models/Event.model");
  const { Ministry } = await import("../models/Ministry.model");
  const { GrowthGroup } = await import("../models/GrowthGroup.model");
  const { PastoralCareRequest } = await import("../models/PastoralCareRequest.model");
  const { AccessLog } = await import("../models/AccessLog.model");
  const { hashPassword } = await import("../helpers/password.helper");
  const { signAccessToken } = await import("../helpers/jwt.helper");

  await connectDB(process.env.MONGODB_URI);
  app = createApp();

  const church = await Church.create({
    name: "Igreja Teste",
    logoUrl: "https://example.com/logo.png",
    slug: "igreja-teste-dashboard",
    settings: { primaryColor: "#123456" },
  });
  churchId = String(church._id);

  const member = await User.create({
    churchId: church._id,
    name: "Membro Teste",
    email: "membro-dashboard@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["member"],
  });

  const admin = await User.create({
    churchId: church._id,
    name: "Admin Teste",
    email: "admin-dashboard@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["admin"],
  });

  const leader = await User.create({
    churchId: church._id,
    name: "Líder Ministério",
    email: "lider-dashboard@teste.com",
    passwordHash: await hashPassword("senha123"),
    roles: ["ministryLeader"],
  });

  const ministry = await Ministry.create({
    churchId: church._id,
    name: "Louvor",
    leader: leader._id,
  });
  ministryId = String(ministry._id);

  await Event.create({
    churchId: church._id,
    title: "Evento Futuro",
    imageUrl: "https://example.com/img.png",
    date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await GrowthGroup.create({
    churchId: church._id,
    name: "GC Teste",
    leaderId: leader._id,
  });

  await PastoralCareRequest.create({
    churchId: church._id,
    userId: member._id,
    message: "Preciso de oração",
    status: "pending",
  });

  await AccessLog.create([
    { churchId: church._id, authenticated: true, userId: member._id, path: "/churches/me" },
    { churchId: church._id, authenticated: true, userId: member._id, ministryId: ministry._id, path: `/ministries/${ministryId}` },
    { churchId: church._id, authenticated: false, path: "/public/churches/igreja-teste-dashboard" },
  ]);

  memberAccessToken = signAccessToken({ sub: String(member._id), churchId, roles: ["member"] });
  adminAccessToken = signAccessToken({ sub: String(admin._id), churchId, roles: ["admin"] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe("GET /athos_adm/api/dashboard/summary", () => {
  it("rejeita membro comum (apenas admin)", async () => {
    const response = await request(app)
      .get("/athos_adm/api/dashboard/summary")
      .set("Authorization", `Bearer ${memberAccessToken}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("retorna contadores, acessos por dia e por ministério para admin", async () => {
    const response = await request(app)
      .get("/athos_adm/api/dashboard/summary")
      .set("Authorization", `Bearer ${adminAccessToken}`);

    expect(response.status).toBe(200);

    const { counts, accessesByDay, accessesByMinistry } = response.body.data;

    expect(counts).toEqual({
      upcomingEvents: 1,
      ministries: 1,
      growthGroups: 1,
      pendingPastoralCareRequests: 1,
      activeUsers: 3,
    });

    expect(accessesByDay).toHaveLength(7);
    const today = accessesByDay[accessesByDay.length - 1];
    expect(today.authenticated).toBe(2);
    expect(today.anonymous).toBe(1);

    expect(accessesByMinistry).toEqual([{ ministryId, name: "Louvor", count: 1 }]);
  });
});

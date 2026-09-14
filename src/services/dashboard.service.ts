import { Types } from "mongoose";
import { Event } from "../models/Event.model";
import { Ministry } from "../models/Ministry.model";
import { GrowthGroup } from "../models/GrowthGroup.model";
import { PastoralCareRequest } from "../models/PastoralCareRequest.model";
import { User } from "../models/User.model";
import { AccessLog } from "../models/AccessLog.model";

const ACCESS_HISTORY_DAYS = 7;

export interface DashboardCountsDTO {
  upcomingEvents: number;
  ministries: number;
  growthGroups: number;
  pendingPastoralCareRequests: number;
  activeUsers: number;
}

export interface DailyAccessDTO {
  date: string;
  authenticated: number;
  anonymous: number;
}

export interface MinistryAccessDTO {
  ministryId: string;
  name: string;
  count: number;
}

export interface DashboardSummaryDTO {
  counts: DashboardCountsDTO;
  accessesByDay: DailyAccessDTO[];
  accessesByMinistry: MinistryAccessDTO[];
}

async function getCounts(churchId: string): Promise<DashboardCountsDTO> {
  const [upcomingEvents, ministries, growthGroups, pendingPastoralCareRequests, activeUsers] =
    await Promise.all([
      Event.countDocuments({ churchId, date: { $gte: new Date() } }),
      Ministry.countDocuments({ churchId }),
      GrowthGroup.countDocuments({ churchId }),
      PastoralCareRequest.countDocuments({ churchId, status: "pending" }),
      User.countDocuments({ churchId, active: true }),
    ]);

  return { upcomingEvents, ministries, growthGroups, pendingPastoralCareRequests, activeUsers };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function getAccessesByDay(churchId: string): Promise<DailyAccessDTO[]> {
  const since = new Date();
  since.setDate(since.getDate() - (ACCESS_HISTORY_DAYS - 1));
  since.setHours(0, 0, 0, 0);

  const rows = await AccessLog.aggregate<{ _id: { day: string; authenticated: boolean }; count: number }>([
    { $match: { churchId: new Types.ObjectId(churchId), createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          authenticated: "$authenticated",
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDay = new Map<string, { authenticated: number; anonymous: number }>();
  for (let i = 0; i < ACCESS_HISTORY_DAYS; i++) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    byDay.set(dateKey(day), { authenticated: 0, anonymous: 0 });
  }

  for (const row of rows) {
    const entry = byDay.get(row._id.day);
    if (!entry) continue;
    if (row._id.authenticated) entry.authenticated += row.count;
    else entry.anonymous += row.count;
  }

  return Array.from(byDay.entries()).map(([date, { authenticated, anonymous }]) => ({
    date,
    authenticated,
    anonymous,
  }));
}

async function getAccessesByMinistry(churchId: string): Promise<MinistryAccessDTO[]> {
  const rows = await AccessLog.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { churchId: new Types.ObjectId(churchId), ministryId: { $exists: true, $ne: null } } },
    { $group: { _id: "$ministryId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  if (rows.length === 0) return [];

  const ministries = await Ministry.find({ _id: { $in: rows.map((row) => row._id) } }).select("name");
  const namesById = new Map(ministries.map((ministry) => [String(ministry._id), ministry.name]));

  return rows.map((row) => ({
    ministryId: String(row._id),
    name: namesById.get(String(row._id)) ?? "Ministério removido",
    count: row.count,
  }));
}

export async function getDashboardSummary(churchId: string): Promise<DashboardSummaryDTO> {
  const [counts, accessesByDay, accessesByMinistry] = await Promise.all([
    getCounts(churchId),
    getAccessesByDay(churchId),
    getAccessesByMinistry(churchId),
  ]);

  return { counts, accessesByDay, accessesByMinistry };
}

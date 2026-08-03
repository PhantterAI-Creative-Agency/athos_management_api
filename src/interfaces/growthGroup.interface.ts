import { z } from "zod";

export const createGrowthGroupSchema = z.object({
  churchId: z.string().optional(),
  name: z.string().min(1, "Nome é obrigatório"),
  leaderId: z.string().min(1, "Líder é obrigatório"),
  membersIds: z.array(z.string()).optional(),
  hasPendencies: z.boolean().optional(),
  indicators: z
    .object({
      attendanceRate: z.number().min(0).max(100).optional(),
      lastMeetingAt: z.string().optional(),
    })
    .optional(),
});

export type CreateGrowthGroupDTO = z.infer<typeof createGrowthGroupSchema>;

export const updateGrowthGroupSchema = z.object({
  name: z.string().min(1).optional(),
  leaderId: z.string().min(1).optional(),
  membersIds: z.array(z.string()).optional(),
  hasPendencies: z.boolean().optional(),
  indicators: z
    .object({
      attendanceRate: z.number().min(0).max(100).optional(),
      lastMeetingAt: z.string().optional(),
    })
    .optional(),
});

export type UpdateGrowthGroupDTO = z.infer<typeof updateGrowthGroupSchema>;

export const listGrowthGroupsQuerySchema = z.object({
  mine: z.enum(["true", "false"]).optional(),
});

export type ListGrowthGroupsQueryDTO = z.infer<typeof listGrowthGroupsQuerySchema>;

export interface GrowthGroupDTO {
  id: string;
  churchId: string;
  name: string;
  leaderId: string;
  leaderName: string;
  membersIds: string[];
  hasPendencies: boolean;
  indicators: {
    attendanceRate: number;
    lastMeetingAt?: string;
  };
  createdAt: string;
}

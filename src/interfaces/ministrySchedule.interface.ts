import { z } from "zod";

export const scheduleAssignmentSchema = z.object({
  functionId: z.string(),
  volunteerIds: z.array(z.string()),
});

export const createScheduleSchema = z.object({
  date: z.coerce.date(),
  title: z.string().optional(),
  notes: z.string().optional(),
  assignments: z.array(scheduleAssignmentSchema),
});

export type CreateScheduleDTO = z.infer<typeof createScheduleSchema>;

export const updateScheduleSchema = createScheduleSchema.partial();

export type UpdateScheduleDTO = z.infer<typeof updateScheduleSchema>;

export const listSchedulesQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export type ListSchedulesQueryDTO = z.infer<typeof listSchedulesQuerySchema>;

export interface MinistryScheduleAssignmentDTO {
  functionId: string;
  functionName: string;
  volunteerIds: string[];
  volunteerNames: string[];
}

export interface MinistryScheduleDTO {
  id: string;
  ministryId: string;
  churchId: string;
  date: string;
  title?: string;
  notes?: string;
  assignments: MinistryScheduleAssignmentDTO[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

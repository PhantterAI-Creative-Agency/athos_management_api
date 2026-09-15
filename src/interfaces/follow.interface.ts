import { z } from "zod";

export const createFollowSchema = z.object({
  followingId: z.string().min(1, "followingId é obrigatório"),
});

export type CreateFollowDTO = z.infer<typeof createFollowSchema>;

export const listFollowsQuerySchema = z.object({
  type: z.enum(["followers", "following"]).default("following"),
});

export type ListFollowsQueryDTO = z.infer<typeof listFollowsQuerySchema>;

export interface FollowDTO {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

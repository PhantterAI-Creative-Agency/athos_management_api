import { z } from "zod";

export const FRIENDSHIP_STATUSES = ["suggested", "pending", "accepted"] as const;

export const createFriendshipSchema = z.object({
  friendId: z.string().min(1, "friendId é obrigatório"),
});

export type CreateFriendshipDTO = z.infer<typeof createFriendshipSchema>;

export const listFriendsQuerySchema = z.object({
  status: z.enum(["pending", "accepted"]).optional(),
});

export type ListFriendsQueryDTO = z.infer<typeof listFriendsQuerySchema>;

export interface FriendshipDTO {
  id: string;
  userId: string;
  friendId: string;
  status: (typeof FRIENDSHIP_STATUSES)[number];
  mutualFriendsCount: number;
  createdAt: string;
}

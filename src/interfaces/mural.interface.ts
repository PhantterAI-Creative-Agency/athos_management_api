import { z } from "zod";

export const muralAudienceValues = ["all", "ministry", "growthGroup"] as const;
export const muralVisibilityValues = ["public", "private"] as const;

export const createMuralPostSchema = z
  .object({
    content: z.string().min(1, "Conteúdo é obrigatório"),
    authorType: z.enum(["user", "church"]).default("user"),
    audience: z.enum(muralAudienceValues).default("all"),
    audienceRefId: z.string().optional(),
    visibility: z.enum(muralVisibilityValues).optional(),
  })
  .refine((data) => data.audience === "all" || !!data.audienceRefId, {
    message: "audienceRefId é obrigatório quando audience não é 'all'",
    path: ["audienceRefId"],
  });

export type CreateMuralPostDTO = z.infer<typeof createMuralPostSchema>;

export const listMuralQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListMuralQueryDTO = z.infer<typeof listMuralQuerySchema>;

export type MuralFriendshipRelationStatus = "none" | "pending_sent" | "pending_received" | "accepted";

export interface MuralPostDTO {
  id: string;
  churchId: string;
  authorType: "user" | "church";
  authorId: string;
  authorName?: string;
  authorPhotoUrl?: string;
  content: string;
  audience: (typeof muralAudienceValues)[number];
  audienceRefId?: string;
  visibility: (typeof muralVisibilityValues)[number];
  likesCount: number;
  commentsCount: number;
  liked: boolean;
  viewerFollowsAuthor?: boolean;
  viewerFriendshipStatus?: MuralFriendshipRelationStatus;
  createdAt: string;
}

export interface MuralFeedDTO {
  items: MuralPostDTO[];
  nextCursor?: string;
}

export interface ToggleMuralLikeDTO {
  liked: boolean;
  likesCount: number;
}

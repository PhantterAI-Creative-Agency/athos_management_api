import { z } from "zod";

export const sendChatMessageSchema = z.object({
  sessionId: z.string().min(1, "sessionId é obrigatório"),
  message: z.string().min(1, "message é obrigatório").max(2000, "message deve ter no máximo 2000 caracteres"),
});

export type SendChatMessageDTO = z.infer<typeof sendChatMessageSchema>;

export const sendGuestChatMessageSchema = sendChatMessageSchema.extend({
  guestName: z.string().min(1, "guestName é obrigatório").max(120),
  guestWhatsapp: z.string().min(1, "guestWhatsapp é obrigatório").max(30),
});

export type SendGuestChatMessageDTO = z.infer<typeof sendGuestChatMessageSchema>;

export const chatMessageCategoryValues = ["system_question", "pastoral_care", "other"] as const;

export interface ChatReplyDTO {
  sessionId: string;
  reply: string;
  category: (typeof chatMessageCategoryValues)[number];
}

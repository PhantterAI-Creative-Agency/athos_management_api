import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";

export interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterChatCompletionResponse {
  choices: { message: { content: string } }[];
}

export async function callChatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  if (!env.OPENROUTER_API_KEY) {
    throw new AppError(503, "AI_CHAT_NOT_CONFIGURED", "Integração com o provedor de IA ainda não está configurada");
  }

  const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages,
    }),
  });

  if (!response.ok) {
    throw new AppError(502, "AI_CHAT_PROVIDER_ERROR", "Falha ao consultar o provedor de IA");
  }

  const payload = (await response.json()) as OpenRouterChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new AppError(502, "AI_CHAT_PROVIDER_ERROR", "Resposta inválida do provedor de IA");
  }

  return content;
}

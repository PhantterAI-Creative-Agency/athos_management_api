import fs from "node:fs";
import path from "node:path";
import { ChatMessage } from "../models/ChatMessage.model";
import { callChatCompletion, type ChatCompletionMessage } from "../helpers/openrouter.helper";
import { forwardPastoralCareRequest } from "./pastoralCare.service";
import { getUser } from "./users.service";
import type { AuthTokenPayload } from "../helpers/jwt.helper";
import type { ChatReplyDTO } from "../interfaces/aiChat.interface";

const CONTEXT_MARKDOWN_PATH = path.resolve(__dirname, "../content/ai-assistant-context.md");

const PASTORAL_CARE_KEYWORDS = [
  "oração",
  "orar",
  "ore por",
  "ore para",
  "interceder",
  "intercessão",
  "aconselhamento",
  "aconselhar",
  "conselho pastoral",
  "preciso conversar com",
  "preciso de ajuda espiritual",
  "estou sofrendo",
  "crise no casamento",
  "crise conjugal",
  "depressão",
  "ansiedade forte",
  "pensamentos suicidas",
  "quero acabar com tudo",
  "falar com o pastor",
  "falar com um líder",
];

const PASTORAL_CARE_REPLY =
  "Entendo, e é importante que alguém da nossa liderança cuide disso com você diretamente — " +
  "não é algo que eu, como assistente, deva tentar resolver. Já encaminhei seu pedido para " +
  "a equipe de pastores e presbíteros, e alguém deve entrar em contato em breve.";

function readContextMarkdown(): string {
  try {
    return fs.readFileSync(CONTEXT_MARKDOWN_PATH, "utf8");
  } catch {
    return "";
  }
}

export function classifyIntent(message: string): "pastoral_care" | "system_question" {
  const normalized = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  const isPastoralCare = PASTORAL_CARE_KEYWORDS.some((keyword) => {
    const normalizedKeyword = keyword
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return normalized.includes(normalizedKeyword);
  });

  return isPastoralCare ? "pastoral_care" : "system_question";
}

function buildSystemPrompt(userContext: string): string {
  return [
    "Você se chama Mateus, o assistente virtual da igreja no sistema Athos Management.",
    "Responda de forma acolhedora, direta e em português do Brasil.",
    "Use apenas as informações abaixo sobre o sistema e o contexto definido pela liderança da igreja.",
    "Nunca invente funcionalidades que não estão descritas aqui.",
    "Você está conversando com o usuário dentro do site da igreja (versão web do Athos Management) — nunca diga para ele 'abrir o app' ou 'baixar o aplicativo'; ele já está no site.",
    "Quando a resposta envolver uma seção do sistema, responda a pergunta diretamente com a informação disponível no contexto abaixo e, além disso, indique o link da página do site onde ela pode ver/confirmar isso, em vez de apenas direcionar sem responder.",
    "Se a informação pedida estiver no contexto abaixo (por exemplo, horários de culto, endereço, ministérios, GCs), responda com ela — não diga que não tem a informação.",
    "",
    readContextMarkdown(),
    "",
    userContext,
  ].join("\n");
}

interface SendMessageParams {
  churchId: string;
  sessionId: string;
  message: string;
  requester?: AuthTokenPayload;
  guestName?: string;
  guestWhatsapp?: string;
}

export async function sendChatMessage(params: SendMessageParams): Promise<ChatReplyDTO> {
  const { churchId, sessionId, message, requester, guestName, guestWhatsapp } = params;

  await ChatMessage.create({
    churchId,
    userId: requester?.sub,
    guestName,
    guestWhatsapp,
    sessionId,
    role: "user",
    content: message,
  });

  const category = classifyIntent(message);

  if (category === "pastoral_care") {
    await forwardPastoralCareRequest({
      churchId,
      message,
      userId: requester?.sub,
      guestName,
      guestWhatsapp,
    });

    await ChatMessage.create({
      churchId,
      userId: requester?.sub,
      guestName,
      guestWhatsapp,
      sessionId,
      role: "assistant",
      content: PASTORAL_CARE_REPLY,
      category,
    });

    return { sessionId, reply: PASTORAL_CARE_REPLY, category };
  }

  const userContext = requester
    ? await buildLoggedUserContext(requester)
    : buildGuestContext(guestName);

  const history = await ChatMessage.find({ sessionId }).sort({ createdAt: 1 }).limit(20);

  const chatMessages: ChatCompletionMessage[] = [
    { role: "system", content: buildSystemPrompt(userContext) },
    ...history.map((entry) => ({
      role: entry.role as "user" | "assistant",
      content: entry.content,
    })),
  ];

  const reply = await callChatCompletion(chatMessages);

  await ChatMessage.create({
    churchId,
    userId: requester?.sub,
    guestName,
    guestWhatsapp,
    sessionId,
    role: "assistant",
    content: reply,
    category,
  });

  return { sessionId, reply, category };
}

async function buildLoggedUserContext(requester: AuthTokenPayload): Promise<string> {
  const user = await getUser(requester, requester.sub);
  return `O usuário logado se chama ${user.name}. Personalize a resposta usando esse nome quando fizer sentido.`;
}

function buildGuestContext(guestName?: string): string {
  if (!guestName) {
    return "O usuário não está logado e ainda não informou o nome.";
  }
  return `O usuário não está logado. Ele se identificou como ${guestName}. Não tem acesso a dados pessoais do sistema.`;
}

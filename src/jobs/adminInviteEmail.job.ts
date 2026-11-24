import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import Redis from "ioredis";
import { env } from "../config/env";

const QUEUE_NAME = "admin-invite-email";

export interface AdminInviteEmailData {
  to: string;
  name: string;
  churchName: string;
  /** Endereço do site da igreja (para o link de "Esqueci minha senha"). */
  siteUrl?: string;
}

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;
const queue = connection ? new Queue<AdminInviteEmailData>(QUEUE_NAME, { connection }) : undefined;

const transporter =
  env.GMAIL_APP_MAIL && env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({ service: "gmail", auth: { user: env.GMAIL_APP_MAIL, pass: env.GMAIL_APP_PASSWORD } })
    : undefined;

export function buildAdminInviteMessage(data: AdminInviteEmailData): { subject: string; text: string } {
  const resetUrl = data.siteUrl ? `${data.siteUrl.replace(/\/+$/, "")}/esqueci-a-senha` : undefined;
  return {
    subject: `Bem-vindo(a) ao painel de ${data.churchName}`,
    text: [
      `Olá, ${data.name}!`,
      "",
      `A conta de administrador de ${data.churchName} foi criada na plataforma Athos Management.`,
      "",
      "Para definir sua senha:",
      resetUrl
        ? `1. Acesse ${resetUrl}`
        : "1. No site ou no app da igreja, toque em \"Esqueci minha senha\".",
      `2. Informe este e-mail (${data.to}) e use o código que chegará na sua caixa de entrada.`,
      "",
      "No primeiro acesso ao painel, o representante legal da igreja precisará aceitar o contrato de prestação de serviços.",
      "",
      "Se você não esperava este e-mail, ignore-o ou responda avisando.",
    ].join("\n"),
  };
}

async function processAdminInviteEmail(data: AdminInviteEmailData): Promise<void> {
  if (!transporter) {
    console.log(`[admin-invite-email:stub] to=${data.to}`);
    return;
  }
  const sender = env.GMAIL_APP_NAME ? `${env.GMAIL_APP_NAME} <${env.GMAIL_APP_MAIL}>` : env.GMAIL_APP_MAIL;
  await transporter.sendMail({ from: sender, to: data.to, ...buildAdminInviteMessage(data) });
}

if (connection) {
  new Worker<AdminInviteEmailData>(QUEUE_NAME, async (job) => processAdminInviteEmail(job.data), { connection });
}

export async function enqueueAdminInviteEmail(data: AdminInviteEmailData): Promise<void> {
  if (queue) {
    await queue.add("send", data, { removeOnComplete: true });
    return;
  }
  await processAdminInviteEmail(data);
}

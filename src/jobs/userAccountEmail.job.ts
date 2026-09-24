import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import Redis from "ioredis";
import { env } from "../config/env";

const QUEUE_NAME = "user-account-email";

export interface UserAccountEmailData {
  to: string;
  name: string;
  churchName: string;
  action: "created" | "updated";
  pendingApproval?: boolean;
}

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;

const userAccountEmailQueue = connection
  ? new Queue<UserAccountEmailData>(QUEUE_NAME, { connection })
  : undefined;

const transporter =
  env.GMAIL_APP_MAIL && env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: env.GMAIL_APP_MAIL,
          pass: env.GMAIL_APP_PASSWORD,
        },
      })
    : undefined;

function buildMessage(data: UserAccountEmailData): { subject: string; text: string } {
  if (data.action === "created") {
    return {
      subject: `Seu cadastro em ${data.churchName} foi realizado`,
      text: [
        `Olá, ${data.name}!`,
        "",
        `Seu cadastro em ${data.churchName} foi realizado com sucesso.`,
        data.pendingApproval
          ? "Ele está aguardando a ativação por um administrador. Você será avisado assim que puder acessar."
          : "Você já pode acessar sua conta.",
        "",
        "Se você não reconhece este cadastro, entre em contato com a igreja.",
      ].join("\n"),
    };
  }

  return {
    subject: `Seus dados em ${data.churchName} foram atualizados`,
    text: [
      `Olá, ${data.name}!`,
      "",
      `Os dados da sua conta em ${data.churchName} foram atualizados.`,
      "",
      "Se você não reconhece esta alteração, entre em contato com a igreja.",
    ].join("\n"),
  };
}

async function processUserAccountEmail(data: UserAccountEmailData): Promise<void> {
  if (!transporter) {
    console.log(`[user-account-email:stub] to=${data.to} action=${data.action}`);
    return;
  }

  const sender = env.GMAIL_APP_NAME ? `${env.GMAIL_APP_NAME} <${env.GMAIL_APP_MAIL}>` : env.GMAIL_APP_MAIL;
  const { subject, text } = buildMessage(data);

  await transporter.sendMail({ from: sender, to: data.to, subject, text });
}

if (connection) {
  new Worker<UserAccountEmailData>(
    QUEUE_NAME,
    async (job) => {
      await processUserAccountEmail(job.data);
    },
    { connection },
  );
}

export async function enqueueUserAccountEmail(data: UserAccountEmailData): Promise<void> {
  if (userAccountEmailQueue) {
    await userAccountEmailQueue.add("send", data, { removeOnComplete: true });
    return;
  }

  await processUserAccountEmail(data);
}

// Aviso ao usuário; falha no envio não deve derrubar a operação que já foi salva.
export async function notifyUserAccount(data: Omit<UserAccountEmailData, "to"> & { to?: string | null }): Promise<void> {
  if (!data.to) return;

  try {
    await enqueueUserAccountEmail({ ...data, to: data.to });
  } catch (error) {
    console.error("[user-account-email] falha ao enviar aviso", error);
  }
}

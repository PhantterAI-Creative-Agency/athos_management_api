import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import Redis from "ioredis";
import { env } from "../config/env";
import type { CreateDataDeletionRequestDTO } from "../interfaces/dataDeletionRequest.interface";

const QUEUE_NAME = "data-deletion-request-email";

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;

const dataDeletionRequestEmailQueue = connection
  ? new Queue<CreateDataDeletionRequestDTO>(QUEUE_NAME, { connection })
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

async function processDataDeletionRequestEmail(data: CreateDataDeletionRequestDTO): Promise<void> {
  if (!transporter) {
    console.log(`[data-deletion-request-email:stub] from=${data.email}`);
    return;
  }

  const sender = env.GMAIL_APP_NAME ? `${env.GMAIL_APP_NAME} <${env.GMAIL_APP_MAIL}>` : env.GMAIL_APP_MAIL;

  await transporter.sendMail({
    from: sender,
    to: env.GMAIL_APP_MAIL,
    replyTo: data.email,
    subject: `[Exclusão de Dados] Solicitação de ${data.name}`,
    text: [
      `Nome: ${data.name}`,
      `Email: ${data.email}`,
      `Incluir dados dos filhos menores: ${data.includeChildren ? "SIM" : "não"}`,
      "",
      "Excluir todos os dados pessoais, inclusive os sensíveis (ficha médica) e o histórico de consentimentos.",
      "Registros de aceite e de ofertas podem ser mantidos apenas pelo prazo legal (ver Política de Privacidade).",
      "",
      "Motivo:",
      data.reason ?? "-",
    ].join("\n"),
  });
}

if (connection) {
  new Worker<CreateDataDeletionRequestDTO>(
    QUEUE_NAME,
    async (job) => {
      await processDataDeletionRequestEmail(job.data);
    },
    { connection },
  );
}

export async function enqueueDataDeletionRequestEmail(data: CreateDataDeletionRequestDTO): Promise<void> {
  if (dataDeletionRequestEmailQueue) {
    await dataDeletionRequestEmailQueue.add("send", data);
    return;
  }

  await processDataDeletionRequestEmail(data);
}

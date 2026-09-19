import { Queue, Worker } from "bullmq";
import nodemailer from "nodemailer";
import Redis from "ioredis";
import { env } from "../config/env";

const QUEUE_NAME = "registration-email";

export interface RegistrationEmailData {
  recipients: string[];
  churchName: string;
  name: string;
  email: string;
  username?: string;
  isChurchMember: boolean;
  address?: {
    cep?: string;
    street?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    number?: string;
    complement?: string;
  };
}

const connection = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined;

const registrationEmailQueue = connection
  ? new Queue<RegistrationEmailData>(QUEUE_NAME, { connection })
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

function formatAddress(address: RegistrationEmailData["address"]): string {
  if (!address) return "-";

  const line1 = [address.street, address.number].filter(Boolean).join(", ");
  const line2 = [address.neighborhood, [address.city, address.state].filter(Boolean).join("/")]
    .filter(Boolean)
    .join(" - ");

  return [line1, address.complement, line2, address.cep ? `CEP ${address.cep}` : undefined]
    .filter(Boolean)
    .join(" | ");
}

async function processRegistrationEmail(data: RegistrationEmailData): Promise<void> {
  if (!transporter || data.recipients.length === 0) {
    console.log(`[registration-email:stub] user=${data.email} recipients=${data.recipients.length}`);
    return;
  }

  const sender = env.GMAIL_APP_NAME ? `${env.GMAIL_APP_NAME} <${env.GMAIL_APP_MAIL}>` : env.GMAIL_APP_MAIL;

  await transporter.sendMail({
    from: sender,
    to: data.recipients,
    replyTo: data.email,
    subject: `[Cadastro] Novo usuário aguardando ativação: ${data.name}`,
    text: [
      `Um novo usuário se cadastrou em ${data.churchName} e está inativo, aguardando ativação.`,
      "",
      `Nome: ${data.name}`,
      `E-mail: ${data.email}`,
      `Usuário: ${data.username ?? "-"}`,
      `Membro da Princípios de Vida: ${data.isChurchMember ? "Sim" : "Não"}`,
      `Endereço: ${formatAddress(data.address)}`,
      "",
      "Acesse o painel administrativo, em Usuários, para ativar o cadastro.",
    ].join("\n"),
  });
}

if (connection) {
  new Worker<RegistrationEmailData>(
    QUEUE_NAME,
    async (job) => {
      await processRegistrationEmail(job.data);
    },
    { connection },
  );
}

export async function enqueueRegistrationEmail(data: RegistrationEmailData): Promise<void> {
  if (registrationEmailQueue) {
    await registrationEmailQueue.add("send", data);
    return;
  }

  await processRegistrationEmail(data);
}

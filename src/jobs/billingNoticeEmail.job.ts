import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter =
  env.GMAIL_APP_MAIL && env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({ service: "gmail", auth: { user: env.GMAIL_APP_MAIL, pass: env.GMAIL_APP_PASSWORD } })
    : undefined;

export type BillingNoticeKind = "trial_ending" | "past_due" | "read_only" | "canceled";

export function buildBillingNotice(kind: BillingNoticeKind, churchName: string, until?: Date): { subject: string; text: string } {
  const date = until ? until.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
  const footer = "\n\nAcesse o painel → Meu plano para ver as faturas e regularizar.\nNenhum dado da igreja é apagado por atraso.";
  switch (kind) {
    case "trial_ending":
      return { subject: `${churchName}: o período de teste termina em ${date}`, text: `O período de teste de ${churchName} termina em ${date}. Para continuar usando a plataforma sem interrupção, escolha um plano no painel.${footer}` };
    case "past_due":
      return { subject: `${churchName}: mensalidade em aberto`, text: `Há uma mensalidade de ${churchName} em aberto. O acesso completo continua até ${date}; depois disso, o painel fica somente para consulta até o pagamento.${footer}` };
    case "read_only":
      return { subject: `${churchName}: painel em modo somente leitura`, text: `Como a mensalidade de ${churchName} segue em aberto, o painel e o app passaram a funcionar somente para consulta. Assim que o pagamento for confirmado, tudo volta ao normal.${footer}` };
    case "canceled":
      return { subject: `${churchName}: assinatura cancelada`, text: `A assinatura de ${churchName} foi cancelada. O acesso completo vale até ${date}. Os dados continuam guardados e podem ser exportados.${footer}` };
  }
}

export async function sendBillingNotice(to: string[], kind: BillingNoticeKind, churchName: string, until?: Date): Promise<void> {
  if (!to.length) return;
  const message = buildBillingNotice(kind, churchName, until);
  if (!transporter) {
    console.log(`[billing-notice:stub] ${kind} to=${to.length} destinatário(s)`);
    return;
  }
  const sender = env.GMAIL_APP_NAME ? `${env.GMAIL_APP_NAME} <${env.GMAIL_APP_MAIL}>` : env.GMAIL_APP_MAIL;
  await transporter.sendMail({ from: sender, to: to.join(","), ...message });
}

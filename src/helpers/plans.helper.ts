import { env } from "../config/env";
import type { ChurchFeature } from "./features.helper";

export const PLAN_IDS = ["essencial", "completo"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Recursos que só existem no plano Completo (URS-COB-02). Os demais valem para todos. */
export const COMPLETO_ONLY_FEATURES: ChurchFeature[] = ["aiAssistant", "ads", "radio"];

export interface PlanDTO {
  id: PlanId;
  name: string;
  price: number;
  features: string[];
}

export function getPlans(): PlanDTO[] {
  return [
    {
      id: "essencial",
      name: "Essencial",
      price: env.PLAN_ESSENCIAL_PRICE,
      features: ["Site e app da igreja", "Membros e famílias", "Ministérios e escalas", "Eventos e inscrições", "Células (GC)", "Ofertas pela chave PIX"],
    },
    {
      id: "completo",
      name: "Completo",
      price: env.PLAN_COMPLETO_PRICE,
      features: ["Tudo do Essencial", "Assistente com IA", "Anúncios", "Rádio", "PIX com confirmação automática (Mercado Pago)"],
    },
  ];
}

export function planPrice(plan: PlanId): number {
  return plan === "completo" ? env.PLAN_COMPLETO_PRICE : env.PLAN_ESSENCIAL_PRICE;
}

export interface StoredSubscription {
  plan?: string | null;
  status?: string | null;
  exempt?: boolean | null;
  trialEndsAt?: Date | null;
  currentPeriodEnd?: Date | null;
  graceUntil?: Date | null;
}

export type AccessLevel = "full" | "read_only";

export interface BillingState {
  plan: PlanId;
  status: SubscriptionStatus;
  exempt: boolean;
  /** "read_only": inadimplência depois da carência — a igreja só consulta, não altera dados. */
  access: AccessLevel;
  /** Data até quando o acesso completo está garantido (fim do teste, da carência ou do período pago). */
  accessUntil?: Date;
  /** Aviso para o painel, quando houver. */
  warning?: "trial_ending" | "past_due" | "read_only" | "canceled";
}

const DAY = 86_400_000;

/**
 * Estado efetivo da assinatura, calculado na hora (sem depender de rotina agendada). Igrejas sem
 * assinatura gravada (as que já existiam antes da cobrança, como a igreja-piloto) são tratadas
 * como Completo e isentas: nada muda para elas.
 */
export function getBillingState(subscription?: StoredSubscription | null, now = new Date()): BillingState {
  if (!subscription?.plan) return { plan: "completo", status: "active", exempt: true, access: "full" };

  const plan = (PLAN_IDS as readonly string[]).includes(subscription.plan) ? (subscription.plan as PlanId) : "essencial";
  const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(subscription.status ?? "")
    ? (subscription.status as SubscriptionStatus)
    : "trial";
  const exempt = !!subscription.exempt;
  if (exempt) return { plan, status: "active", exempt, access: "full" };

  const graceMs = env.BILLING_GRACE_DAYS * DAY;

  if (status === "trial") {
    const end = subscription.trialEndsAt ?? now;
    if (end > now) {
      return { plan, status, exempt, access: "full", accessUntil: end, warning: end.getTime() - now.getTime() < 5 * DAY ? "trial_ending" : undefined };
    }
    const graceEnd = new Date(end.getTime() + graceMs);
    return graceEnd > now
      ? { plan, status: "past_due", exempt, access: "full", accessUntil: graceEnd, warning: "past_due" }
      : { plan, status: "past_due", exempt, access: "read_only", warning: "read_only" };
  }

  if (status === "past_due") {
    const graceEnd = subscription.graceUntil ?? now;
    return graceEnd > now
      ? { plan, status, exempt, access: "full", accessUntil: graceEnd, warning: "past_due" }
      : { plan, status, exempt, access: "read_only", warning: "read_only" };
  }

  if (status === "canceled") {
    const end = subscription.currentPeriodEnd ?? now;
    return end > now
      ? { plan, status, exempt, access: "full", accessUntil: end, warning: "canceled" }
      : { plan, status, exempt, access: "read_only", warning: "read_only" };
  }

  return { plan, status, exempt, access: "full", accessUntil: subscription.currentPeriodEnd ?? undefined };
}

/** O plano da igreja inclui o recurso? */
export function planAllows(plan: PlanId, feature: ChurchFeature): boolean {
  return plan === "completo" || !COMPLETO_ONLY_FEATURES.includes(feature);
}

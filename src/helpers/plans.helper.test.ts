import { describe, expect, it } from "vitest";
import { getBillingState, planAllows } from "./plans.helper";

const now = new Date("2026-12-01T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe("estado da assinatura", () => {
  it("igreja anterior à cobrança é Completo isenta", () => {
    expect(getBillingState(undefined, now)).toMatchObject({ plan: "completo", exempt: true, access: "full" });
  });

  it("teste em andamento e aviso perto do fim", () => {
    expect(getBillingState({ plan: "essencial", status: "trial", trialEndsAt: days(20) }, now)).toMatchObject({ access: "full", warning: undefined });
    expect(getBillingState({ plan: "essencial", status: "trial", trialEndsAt: days(3) }, now)).toMatchObject({ access: "full", warning: "trial_ending" });
  });

  it("teste vencido: carência e depois somente leitura", () => {
    expect(getBillingState({ plan: "essencial", status: "trial", trialEndsAt: days(-5) }, now)).toMatchObject({ status: "past_due", access: "full" });
    expect(getBillingState({ plan: "essencial", status: "trial", trialEndsAt: days(-20) }, now)).toMatchObject({ access: "read_only" });
  });

  it("inadimplente respeita a carência", () => {
    expect(getBillingState({ plan: "completo", status: "past_due", graceUntil: days(2) }, now)).toMatchObject({ access: "full", warning: "past_due" });
    expect(getBillingState({ plan: "completo", status: "past_due", graceUntil: days(-1) }, now)).toMatchObject({ access: "read_only" });
  });

  it("cancelada vale até o fim do período; isenta nunca bloqueia", () => {
    expect(getBillingState({ plan: "completo", status: "canceled", currentPeriodEnd: days(10) }, now)).toMatchObject({ access: "full", warning: "canceled" });
    expect(getBillingState({ plan: "completo", status: "canceled", currentPeriodEnd: days(-1) }, now)).toMatchObject({ access: "read_only" });
    expect(getBillingState({ plan: "essencial", status: "past_due", graceUntil: days(-30), exempt: true }, now)).toMatchObject({ access: "full", exempt: true });
  });

  it("recursos por plano", () => {
    expect(planAllows("essencial", "aiAssistant")).toBe(false);
    expect(planAllows("essencial", "onlineOfferings")).toBe(true);
    expect(planAllows("completo", "radio")).toBe(true);
  });
});

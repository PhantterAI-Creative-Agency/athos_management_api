import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { formatMercadoPagoDate, verifyWebhookSignature } from "./mercadopagoPayments.helper";

const secret = "segredo";
function header(manifest: string, ts: number) {
  return `ts=${ts},v1=${crypto.createHmac("sha256", secret).update(manifest).digest("hex")}`;
}

describe("assinatura do webhook", () => {
  const ts = Math.floor(Date.now() / 1000);
  it("aceita assinatura válida", () => {
    const signatureHeader = header(`id:123;request-id:abc;ts:${ts};`, ts);
    expect(verifyWebhookSignature({ signatureHeader, requestId: "abc", dataId: "123", secret })).toBe(true);
  });
  it("usa data.id em minúsculas quando alfanumérico", () => {
    const signatureHeader = header(`id:abc9;request-id:r;ts:${ts};`, ts);
    expect(verifyWebhookSignature({ signatureHeader, requestId: "r", dataId: "ABC9", secret })).toBe(true);
  });
  it("recusa id trocado, segredo errado ou notificação antiga", () => {
    const signatureHeader = header(`id:123;request-id:abc;ts:${ts};`, ts);
    expect(verifyWebhookSignature({ signatureHeader, requestId: "abc", dataId: "124", secret })).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader, requestId: "abc", dataId: "123", secret: "outro" })).toBe(false);
    const old = ts - 3600;
    expect(
      verifyWebhookSignature({ signatureHeader: header(`id:123;request-id:abc;ts:${old};`, old), requestId: "abc", dataId: "123", secret }),
    ).toBe(false);
    expect(verifyWebhookSignature({ signatureHeader: undefined, dataId: "123", secret })).toBe(false);
  });
});

describe("data no formato do Mercado Pago", () => {
  it("usa horário de Brasília", () => {
    expect(formatMercadoPagoDate(new Date("2026-11-23T15:30:00.000Z"))).toBe("2026-11-23T12:30:00.000-03:00");
  });
});

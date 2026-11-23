import { describe, expect, it } from "vitest";
import { buildStaticPixPayload, crc16, formatPixKey, normalizePixKey } from "./pix.helper";

describe("BR Code estático", () => {
  it("reproduz o exemplo do manual do Banco Central", () => {
    const payload = buildStaticPixPayload({
      key: "123e4567-e12b-12d1-a456-426655440000",
      receiverName: "Fulano de Tal",
      city: "BRASILIA",
    });
    expect(payload).toBe(
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
    );
  });

  it("inclui valor, txid e remove acentos, limitando nome e cidade", () => {
    const payload = buildStaticPixPayload({
      key: "+5511987654321",
      receiverName: "Igreja Princípios de Vida Comunidade Cristã",
      city: "São José dos Campos",
      amount: 50,
      txid: "6b04488a-0988-58bf",
    });
    expect(payload).toContain("540550.00");
    expect(payload).toContain("5925Igreja Principios de Vida");
    expect(payload).toContain("6015Sao Jose dos Ca");
    expect(payload).toContain("0516" + "6b04488a098858bf");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it("mantém o campo 26 dentro de 99 caracteres com descrição", () => {
    const payload = buildStaticPixPayload({
      key: "contato@igreja.org",
      receiverName: "Igreja",
      city: "Recife",
      description: "Oferta de missões para o acampamento de jovens de 2026 com muitos detalhes",
    });
    const length = Number(payload.slice(payload.indexOf("26") + 2, payload.indexOf("26") + 4));
    expect(length).toBeLessThanOrEqual(99);
  });
});

describe("chaves PIX", () => {
  it("normaliza cada tipo", () => {
    expect(normalizePixKey("cpf", "529.982.247-25")).toBe("52998224725");
    expect(normalizePixKey("cnpj", "11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizePixKey("email", " Contato@Igreja.ORG ")).toBe("contato@igreja.org");
    expect(normalizePixKey("phone", "(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePixKey("phone", "+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizePixKey("random", "123E4567-E12B-12D1-A456-426655440000")).toBe(
      "123e4567-e12b-12d1-a456-426655440000",
    );
  });

  it("recusa chaves inválidas", () => {
    expect(() => normalizePixKey("cpf", "111.111.111-11")).toThrow(/CPF/);
    expect(() => normalizePixKey("email", "sem-arroba")).toThrow(/E-mail/);
    expect(() => normalizePixKey("phone", "1234")).toThrow(/Telefone/);
    expect(() => normalizePixKey("random", "abc")).toThrow(/aleatória/);
  });

  it("formata para exibição", () => {
    expect(formatPixKey("cpf", "52998224725")).toBe("529.982.247-25");
    expect(formatPixKey("phone", "+5511987654321")).toBe("(11) 98765-4321");
  });
});

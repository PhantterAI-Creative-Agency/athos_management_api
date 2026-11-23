import { AppError } from "../middlewares/errorHandler";
import { isValidCnpj, isValidCpf, onlyDigits } from "./brDocument.helper";

export const PIX_KEY_TYPES = ["cpf", "cnpj", "email", "phone", "random"] as const;
export type PixKeyType = (typeof PIX_KEY_TYPES)[number];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function invalid(message: string): never {
  throw new AppError(400, "INVALID_PIX_KEY", message);
}

/** Valida a chave PIX conforme o tipo e devolve no formato usado pelo DICT (Banco Central). */
export function normalizePixKey(type: PixKeyType, raw: string): string {
  const value = raw.trim();
  switch (type) {
    case "cpf": {
      if (!isValidCpf(value)) invalid("CPF inválido");
      return onlyDigits(value);
    }
    case "cnpj": {
      if (!isValidCnpj(value)) invalid("CNPJ inválido");
      return onlyDigits(value);
    }
    case "email": {
      const email = value.toLowerCase();
      if (!EMAIL_REGEX.test(email) || email.length > 77) invalid("E-mail inválido");
      return email;
    }
    case "phone": {
      let digits = onlyDigits(value);
      if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
      if (digits.length !== 10 && digits.length !== 11) invalid("Telefone inválido: informe DDD + número");
      return `+55${digits}`;
    }
    case "random": {
      const key = value.toLowerCase();
      if (!UUID_REGEX.test(key)) invalid("Chave aleatória inválida");
      return key;
    }
  }
}

/** Remove acentos e caracteres que o BR Code não aceita, limitando o tamanho. */
function sanitize(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function tlv(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF), exigido no campo 63 do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface StaticPixInput {
  key: string;
  receiverName: string;
  city: string;
  amount?: number;
  /** Identificador da cobrança (até 25 letras/números). Sem ele, "***". */
  txid?: string;
  description?: string;
}

/**
 * Monta o "PIX copia e cola" estático (BR Code / EMV-MPM, Manual de Padrões para Iniciação do
 * Pix do Banco Central). O pagamento cai direto na conta dona da chave; não há confirmação
 * automática.
 */
export function buildStaticPixPayload(input: StaticPixInput): string {
  const txid = input.txid ? input.txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***" : "***";

  let merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", input.key);
  if (input.description) {
    // O campo 26 inteiro não pode passar de 99 caracteres.
    const room = 99 - merchantAccount.length - 4;
    const description = sanitize(input.description, Math.max(0, room));
    if (description) merchantAccount += tlv("02", description);
  }

  const payload =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    (input.amount && input.amount > 0 ? tlv("54", input.amount.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", sanitize(input.receiverName, 25)) +
    tlv("60", sanitize(input.city, 15)) +
    tlv("62", tlv("05", txid)) +
    "6304";

  return payload + crc16(payload);
}

/** Chave formatada para exibição (CPF/CNPJ/telefone com máscara). */
export function formatPixKey(type: PixKeyType, key: string): string {
  if (type === "cpf") return key.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (type === "cnpj") return key.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (type === "phone") {
    const d = key.slice(3);
    return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return key;
}

import { z } from "zod";
import { PIX_KEY_TYPES, type PixKeyType } from "../helpers/pix.helper";

export const setPixConfigSchema = z.object({
  keyType: z.enum(PIX_KEY_TYPES, { message: "Tipo de chave inválido" }),
  key: z.string().trim().min(1, "Informe a chave PIX").max(100),
  receiverName: z.string().trim().min(2, "Informe o nome do recebedor").max(60),
  city: z.string().trim().min(2, "Informe a cidade").max(60),
});

export type SetPixConfigDTO = z.infer<typeof setPixConfigSchema>;

export const pixChargeQuerySchema = z.object({
  amount: z.coerce.number().positive("Valor inválido").max(1_000_000).optional(),
  type: z.enum(["contribution", "donation"]).optional(),
});

export type PixChargeQueryDTO = z.infer<typeof pixChargeQuerySchema>;

export interface PixConfigDTO {
  keyType: PixKeyType;
  key: string;
  keyFormatted: string;
  receiverName: string;
  city: string;
}

export interface StaticPixChargeDTO extends PixConfigDTO {
  amount?: number;
  /** "PIX copia e cola" (BR Code). */
  payload: string;
  /** QR Code do BR Code, em PNG (data URL). */
  qrCodeDataUrl: string;
  /** Sempre false: com a chave estática não há confirmação automática do pagamento. */
  automaticConfirmation: false;
}

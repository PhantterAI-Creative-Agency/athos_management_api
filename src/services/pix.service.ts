import QRCode from "qrcode";
import { Church } from "../models/Church.model";
import { AppError } from "../middlewares/errorHandler";
import { buildStaticPixPayload, formatPixKey, normalizePixKey, type PixKeyType } from "../helpers/pix.helper";
import type { PixConfigDTO, SetPixConfigDTO, StaticPixChargeDTO } from "../interfaces/pix.interface";

type StoredPix = { keyType: string; key: string; receiverName: string; city: string };

function toDTO(pix: StoredPix): PixConfigDTO {
  const keyType = pix.keyType as PixKeyType;
  return {
    keyType,
    key: pix.key,
    keyFormatted: formatPixKey(keyType, pix.key),
    receiverName: pix.receiverName,
    city: pix.city,
  };
}

async function loadChurch(churchId: string) {
  const church = await Church.findById(churchId);
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  return church;
}

export async function getPixConfig(churchId: string): Promise<PixConfigDTO | null> {
  const church = await Church.findById(churchId).select("pix").lean();
  if (!church) throw new AppError(404, "CHURCH_NOT_FOUND", "Igreja não encontrada");
  return church.pix ? toDTO(church.pix) : null;
}

export async function setPixConfig(churchId: string, data: SetPixConfigDTO): Promise<PixConfigDTO> {
  const church = await loadChurch(churchId);
  const pix = {
    keyType: data.keyType,
    key: normalizePixKey(data.keyType, data.key),
    receiverName: data.receiverName,
    city: data.city,
  };
  church.set("pix", pix);
  await church.save();
  return toDTO(pix);
}

export async function removePixConfig(churchId: string): Promise<void> {
  const church = await loadChurch(churchId);
  church.set("pix", undefined);
  await church.save();
}

/** Cobrança PIX estática (copia e cola + QR) na chave da igreja. `null` se não houver chave. */
export async function buildChurchPixCharge(
  churchId: string,
  options: { amount?: number; txid?: string; description?: string } = {},
): Promise<StaticPixChargeDTO | null> {
  const config = await getPixConfig(churchId);
  if (!config) return null;

  const payload = buildStaticPixPayload({
    key: config.key,
    receiverName: config.receiverName,
    city: config.city,
    amount: options.amount,
    txid: options.txid,
    description: options.description,
  });

  return {
    ...config,
    amount: options.amount,
    payload,
    qrCodeDataUrl: await QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1, width: 320 }),
    automaticConfirmation: false,
  };
}

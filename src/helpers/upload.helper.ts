import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Request } from "express";
import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";

function resolveInsideUploadDir(relativePath: string): string {
  const root = path.resolve(env.UPLOAD_DIR);
  const absolute = path.resolve(root, relativePath);

  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    throw new AppError(400, "INVALID_FILE_PATH", "Caminho de arquivo inválido");
  }

  return absolute;
}

/** Grava o corpo bruto da request em UPLOAD_DIR/<relativeDir>, respeitando o limite de bytes. */
export async function saveRequestBodyToFile(
  req: Request,
  relativeDir: string,
  extension: string,
  maxBytes: number,
): Promise<{ filePath: string; size: number }> {
  const declaredSize = Number(req.headers["content-length"] ?? 0);
  if (declaredSize > maxBytes) {
    throw new AppError(413, "FILE_TOO_LARGE", `Arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }

  const filePath = path.posix.join(relativeDir, `${randomUUID()}${extension}`);
  const absolute = resolveInsideUploadDir(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });

  let size = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) {
        callback(
          new AppError(413, "FILE_TOO_LARGE", `Arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB`),
        );
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(req, limiter, createWriteStream(absolute));
  } catch (error) {
    await unlink(absolute).catch(() => undefined);
    throw error;
  }

  if (size === 0) {
    await unlink(absolute).catch(() => undefined);
    throw new AppError(400, "EMPTY_FILE", "Arquivo vazio");
  }

  return { filePath, size };
}

export async function removeUploadedFile(filePath: string): Promise<void> {
  await unlink(resolveInsideUploadDir(filePath)).catch(() => undefined);
}

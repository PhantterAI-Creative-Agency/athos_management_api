import { env } from "../config/env";
import { AppError } from "../middlewares/errorHandler";
import type { BibleChapterDTO } from "../interfaces/bible.interface";

// Cache leve em memória (TDD §12) — evoluir para Redis se o volume de leitura justificar,
// já que hoje um único processo atende todas as requisições.
const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheEntry = { data: BibleChapterDTO; expiresAt: number };

const cache = new Map<string, CacheEntry>();

function cacheKey(version: string, book: string, chapter: number): string {
  return `${version}:${book}:${chapter}`.toLowerCase();
}

interface AbibliaDigitalChapterResponse {
  book: { abbrev: { pt: string }; name: string };
  chapter: { number: number };
  verses: { number: number; text: string }[];
}

export async function getChapter(version: string, book: string, chapter: number): Promise<BibleChapterDTO> {
  const key = cacheKey(version, book, chapter);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  if (!env.BIBLE_API_TOKEN) {
    throw new AppError(
      503,
      "BIBLE_API_NOT_CONFIGURED",
      "Integração com a API bíblica ainda não está configurada",
    );
  }

  const response = await fetch(`${env.BIBLE_API_BASE_URL}/verses/${version}/${book}/${chapter}`, {
    headers: { Authorization: `Bearer ${env.BIBLE_API_TOKEN}` },
  });

  if (response.status === 404) {
    throw new AppError(404, "BIBLE_CHAPTER_NOT_FOUND", "Capítulo não encontrado");
  }

  if (!response.ok) {
    throw new AppError(502, "BIBLE_API_ERROR", "Falha ao consultar a API bíblica");
  }

  const payload = (await response.json()) as AbibliaDigitalChapterResponse;

  const dto: BibleChapterDTO = {
    book: {
      abbrev: payload.book.abbrev.pt,
      name: payload.book.name,
    },
    version,
    chapter: payload.chapter.number,
    verses: payload.verses.map((verse) => ({ number: verse.number, text: verse.text })),
  };

  cache.set(key, { data: dto, expiresAt: Date.now() + CACHE_TTL_MS });

  return dto;
}

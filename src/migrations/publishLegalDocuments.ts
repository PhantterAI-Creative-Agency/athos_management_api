/**
 * Sprint 1 (tarefa 1.5) — publica os documentos legais a partir de `src/content/legal/*.md`.
 *
 * Para cada arquivo, publica uma nova versão só se o texto mudou desde a última versão.
 * Rodar de novo sem mudanças não faz nada.
 *
 * Uso:
 *   npm run legal:publish              # mudanças relevantes: usuários precisam aceitar de novo
 *   npm run legal:publish -- --minor   # correção menor: publica sem exigir novo aceite
 * (com APP_ENV=qa|production para apontar para o banco do ambiente correspondente)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { connectDB, disconnectDB } from "../config/mongoose";
import { parseLegalMarkdown, syncDocuments } from "../services/legal.service";
import { auditLogWithCtx } from "../helpers/auditLogger.helper";
import type { LegalDocumentType } from "../interfaces/legal.interface";

const CONTENT_DIR = path.resolve(__dirname, "../content/legal");
const PUBLISHED_FROM_FILES: LegalDocumentType[] = ["terms", "privacy", "saas_contract", "dpa", "sensitive_data_consent"];

async function main(): Promise<void> {
  const minor = process.argv.includes("--minor");

  const sources = await Promise.all(
    PUBLISHED_FROM_FILES.map(async (type) =>
      parseLegalMarkdown(type, await fs.readFile(path.join(CONTENT_DIR, `${type}.md`), "utf8")),
    ),
  );

  await connectDB();
  try {
    const results = await syncDocuments(sources, { minor });
    for (const result of results) {
      console.log(`${result.type}: ${result.status === "published" ? "publicado" : "sem mudanças"} (v${result.version})`);
      if (result.status === "published") {
        await auditLogWithCtx({
          action: "CREATE",
          entity: "LegalDocument",
          metadata: { type: result.type, version: result.version, minor, source: "migration:publishLegalDocuments" },
        });
      }
    }
  } finally {
    await disconnectDB();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

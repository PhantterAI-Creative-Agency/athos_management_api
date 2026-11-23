/**
 * Sprint 0 (tarefa 0.6) — mantém a rádio ligada na igreja-piloto depois que a flag
 * `settings.features.radio` passou a existir com padrão `false`.
 *
 * É uma ativação PROVISÓRIA, feita direto no banco sem o aceite do termo de responsabilidade.
 * Na Sprint 6 ela é substituída pelo aceite real do administrador da igreja-piloto.
 *
 * Uso: npm run migrate:pilot-radio -- <slug-da-igreja>
 * (com APP_ENV=qa|production para apontar para o banco do ambiente correspondente)
 */
import { connectDB, disconnectDB } from "../config/mongoose";
import { Church } from "../models/Church.model";
import { auditLogWithCtx } from "../helpers/auditLogger.helper";

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Informe o slug da igreja-piloto: npm run migrate:pilot-radio -- <slug>");
    process.exitCode = 1;
    return;
  }

  await connectDB();
  try {
    const church = await Church.findOne({ slug });
    if (!church) {
      console.error(`Igreja com slug "${slug}" não encontrada`);
      process.exitCode = 1;
      return;
    }

    if (church.settings?.features?.radio === true) {
      console.log(`Rádio já está ativa para "${slug}". Nada a fazer.`);
      return;
    }

    church.set("settings.features.radio", true);
    await church.save();

    await auditLogWithCtx({
      action: "UPDATE",
      entity: "ChurchFeatures",
      entityId: String(church._id),
      churchId: String(church._id),
      metadata: { changes: { radio: true }, reason: "migration:enablePilotRadio (provisório até a Sprint 6)" },
    });

    console.log(`Rádio ativada provisoriamente para "${slug}".`);
  } finally {
    await disconnectDB();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

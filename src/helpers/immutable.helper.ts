import type { MongooseQueryMiddleware, Schema } from "mongoose";
import { AppError } from "../middlewares/errorHandler";

const QUERY_MUTATIONS = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] satisfies MongooseQueryMiddleware[];

/**
 * Torna uma coleção "somente inserção": qualquer update/delete via Mongoose lança erro.
 * Usado em registros que servem de evidência jurídica (documentos legais publicados e
 * aceites), que nunca podem ser alterados depois de gravados. Correções viram um novo
 * registro (nova versão do documento, ou um registro de revogação).
 */
export function makeInsertOnly(schema: Schema, entityLabel: string): void {
  const reject = (): never => {
    throw new AppError(409, "IMMUTABLE_RECORD", `${entityLabel} não pode ser alterado nem removido`);
  };

  schema.pre(QUERY_MUTATIONS, { document: false, query: true }, reject);
  schema.pre("deleteOne", { document: true, query: false }, reject);
  schema.pre("save", function () {
    if (!this.isNew) reject();
  });
}

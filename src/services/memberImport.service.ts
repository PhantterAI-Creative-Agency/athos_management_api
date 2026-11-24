import { Types } from "mongoose";
import { User } from "../models/User.model";
import { AppError } from "../middlewares/errorHandler";
import { normalizeHeader, parseCsv } from "../helpers/csv.helper";

export const MAX_IMPORT_ROWS = 2000;

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ["nome", "nome completo", "name"],
  email: ["email", "e mail"],
  phone: ["telefone", "celular", "whatsapp", "fone", "phone"],
  birthDate: ["nascimento", "data de nascimento", "data nascimento", "aniversario", "birthdate"],
  gender: ["sexo", "genero", "gender"],
  member: ["membro", "e membro", "member"],
};

export interface ImportIssue {
  line: number;
  reason: string;
}

export interface MemberImportResultDTO {
  dryRun: boolean;
  totalRows: number;
  created: number;
  skipped: ImportIssue[];
}

function parseBirthDate(value: string): Date | undefined | null {
  if (!value) return undefined;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parts = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!parts) return null;
  const [y, m, d] = parts.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 1900 || date > new Date()) return null;
  return date;
}

function parseGender(value: string): "M" | "F" | undefined | null {
  const v = normalizeHeader(value);
  if (!v) return undefined;
  if (["m", "masculino", "homem"].includes(v)) return "M";
  if (["f", "feminino", "mulher"].includes(v)) return "F";
  return null;
}

function parseYesNo(value: string): boolean | undefined {
  const v = normalizeHeader(value);
  if (!v) return undefined;
  return ["sim", "s", "yes", "y", "1", "x", "true"].includes(v);
}

/**
 * Importa membros de uma planilha CSV (URS-TEN-05). Colunas reconhecidas: nome (obrigatória),
 * e-mail, telefone, nascimento (DD/MM/AAAA), sexo (M/F) e membro (sim/não). Linhas com e-mail já
 * cadastrado ou dados inválidos são puladas e listadas no relatório. Com `dryRun`, só valida.
 * Os membros entram ativos e sem senha: para acessar, usam "Esqueci minha senha".
 */
export async function importMembers(churchId: string, csv: string, dryRun: boolean): Promise<MemberImportResultDTO> {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new AppError(400, "EMPTY_CSV", "A planilha precisa de um cabeçalho e ao menos uma linha");
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    throw new AppError(400, "CSV_TOO_LARGE", `Importe no máximo ${MAX_IMPORT_ROWS} pessoas por vez`);
  }

  const headers = rows[0].map(normalizeHeader);
  const columnIndex: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const index = headers.findIndex((h) => aliases.includes(h));
    if (index >= 0) columnIndex[field] = index;
  }
  if (columnIndex.name === undefined) {
    throw new AppError(400, "CSV_MISSING_NAME", "A planilha precisa de uma coluna \"nome\"");
  }

  const cell = (row: string[], field: string) => (columnIndex[field] !== undefined ? row[columnIndex[field]] ?? "" : "");

  const skipped: ImportIssue[] = [];
  const seenEmails = new Set<string>();
  const candidates: { line: number; doc: Record<string, unknown>; email?: string }[] = [];

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const name = cell(row, "name");
    if (name.length < 2) return skipped.push({ line, reason: "Nome ausente" });

    const email = cell(row, "email").toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return skipped.push({ line, reason: "E-mail inválido" });
    if (email && seenEmails.has(email)) return skipped.push({ line, reason: "E-mail repetido na planilha" });

    const birthDate = parseBirthDate(cell(row, "birthDate"));
    if (birthDate === null) return skipped.push({ line, reason: "Data de nascimento inválida (use DD/MM/AAAA)" });
    const gender = parseGender(cell(row, "gender"));
    if (gender === null) return skipped.push({ line, reason: "Sexo inválido (use M ou F)" });
    const isMember = parseYesNo(cell(row, "member"));

    if (email) seenEmails.add(email);
    candidates.push({
      line,
      email: email || undefined,
      doc: {
        churchId: new Types.ObjectId(churchId),
        name,
        ...(email ? { email } : {}),
        ...(cell(row, "phone") ? { phone: cell(row, "phone") } : {}),
        ...(birthDate ? { birthDate } : {}),
        ...(gender ? { gender } : {}),
        isChurchMember: isMember ?? true,
        roles: [isMember === false ? "visitor" : "member"],
        active: true,
        pendingApproval: false,
      },
    });
  });

  const emails = candidates.flatMap((c) => (c.email ? [c.email] : []));
  const existing = new Set(
    (await User.find({ email: { $in: emails } }).select("email").lean()).map((u) => String(u.email)),
  );
  const toCreate = candidates.filter((c) => {
    if (c.email && existing.has(c.email)) {
      skipped.push({ line: c.line, reason: "E-mail já cadastrado na plataforma" });
      return false;
    }
    return true;
  });

  if (!dryRun && toCreate.length) {
    await User.insertMany(toCreate.map((c) => c.doc), { ordered: false });
  }

  skipped.sort((a, b) => a.line - b.line);
  return { dryRun, totalRows: rows.length - 1, created: toCreate.length, skipped };
}

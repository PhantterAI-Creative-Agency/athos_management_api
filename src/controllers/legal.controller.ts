import type { NextFunction, Request, Response } from "express";
import * as legalService from "../services/legal.service";
import { sendSuccess } from "../helpers/response.helper";
import { auditLog } from "../helpers/auditLogger.helper";
import type {
  AcceptLegalDocumentDTO,
  ExportEvidenceQueryDTO,
  GetCurrentLegalDocumentQueryDTO,
  LegalDocumentType,
  ListLegalDocumentsQueryDTO,
  PublishLegalDocumentDTO,
  RequestEvidence,
  RevokeLegalDocumentDTO,
} from "../interfaces/legal.interface";

function getType(req: Request): LegalDocumentType {
  return (req.validated?.params as { type: LegalDocumentType }).type;
}

function getEvidence(req: Request): RequestEvidence {
  const forwarded = req.headers["x-forwarded-for"];
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? undefined,
    forwardedFor: Array.isArray(forwarded) ? forwarded.join(", ") : forwarded,
    userAgent: req.headers["user-agent"],
  };
}

export async function getCurrent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as GetCurrentLegalDocumentQueryDTO;
    sendSuccess(res, await legalService.getCurrentDocument(getType(req), query.churchSlug));
  } catch (error) {
    next(error);
  }
}

export async function publish(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as PublishLegalDocumentDTO;
    const doc = await legalService.publishDocument(body, req.user!.sub);
    await auditLog("CREATE", "LegalDocument", doc.id, { type: doc.type, version: doc.version }, req);
    sendSuccess(res, doc, 201);
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ListLegalDocumentsQueryDTO;
    sendSuccess(res, await legalService.listDocuments(query.type));
  } catch (error) {
    next(error);
  }
}

export async function pending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, await legalService.listPending(req.user!));
  } catch (error) {
    next(error);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as AcceptLegalDocumentDTO;
    const record = await legalService.acceptDocument(getType(req), body, req.user!, getEvidence(req));
    await auditLog("ACCEPT", "LegalAcceptance", record.id, { type: record.type, version: record.version }, req);
    sendSuccess(res, record, 201);
  } catch (error) {
    next(error);
  }
}

export async function revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as RevokeLegalDocumentDTO;
    const record = await legalService.revokeDocument(getType(req), body, req.user!, getEvidence(req));
    await auditLog("REVOKE", "LegalAcceptance", record.id, { type: record.type, version: record.version }, req);
    sendSuccess(res, record, 201);
  } catch (error) {
    next(error);
  }
}

export async function evidence(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.validated?.query as ExportEvidenceQueryDTO;
    const isPlatform = req.user!.roles.includes("devAdmin");
    const churchId = isPlatform && query.churchId ? query.churchId : req.user!.churchId;
    const data = await legalService.exportEvidence(churchId, query.type);
    await auditLog("OTHER", "LegalEvidenceExport", churchId, { type: query.type ?? "all" }, req);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evidencias-aceite-${data.church.slug}-${data.generatedAt.slice(0, 10)}.json"`,
    );
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

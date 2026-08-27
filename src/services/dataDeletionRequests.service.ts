import { DataDeletionRequest } from "../models/DataDeletionRequest.model";
import { enqueueDataDeletionRequestEmail } from "../jobs/dataDeletionRequestEmail.job";
import type {
  CreateDataDeletionRequestDTO,
  DataDeletionRequestDTO,
} from "../interfaces/dataDeletionRequest.interface";

type DataDeletionRequestDocumentLike = {
  _id: unknown;
  name: string;
  email: string;
  reason?: string | null;
  status: "pending" | "completed";
  createdAt: Date;
};

function toDataDeletionRequestDTO(doc: DataDeletionRequestDocumentLike): DataDeletionRequestDTO {
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    reason: doc.reason ?? undefined,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function createDataDeletionRequest(
  data: CreateDataDeletionRequestDTO,
): Promise<DataDeletionRequestDTO> {
  const request = await DataDeletionRequest.create(data);

  await enqueueDataDeletionRequestEmail(data);

  return toDataDeletionRequestDTO(request);
}

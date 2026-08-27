import type { NextFunction, Request, Response } from "express";
import * as dataDeletionRequestsService from "../services/dataDeletionRequests.service";
import { sendSuccess } from "../helpers/response.helper";
import type { CreateDataDeletionRequestDTO } from "../interfaces/dataDeletionRequest.interface";

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.validated?.body as CreateDataDeletionRequestDTO;
    const request = await dataDeletionRequestsService.createDataDeletionRequest(body);
    sendSuccess(res, request, 201);
  } catch (error) {
    next(error);
  }
}

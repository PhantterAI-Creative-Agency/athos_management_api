import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { sendError } from "../helpers/response.helper";

type ValidationSource = "body" | "query" | "params";

declare global {
  namespace Express {
    interface Request {
      validated?: Partial<Record<ValidationSource, unknown>>;
    }
  }
}

export function validate(schema: ZodType, source: ValidationSource = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      sendError(res, 400, "VALIDATION_ERROR", result.error.issues.map((issue) => issue.message).join("; "));
      return;
    }

    req.validated = { ...req.validated, [source]: result.data };
    next();
  };
}

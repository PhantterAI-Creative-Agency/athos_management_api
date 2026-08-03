import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { corsOptions } from "./config/cors";
import routes from "./routes";
import { requestContext } from "./middlewares/requestContext";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import { sendSuccess } from "./helpers/response.helper";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(pinoHttp());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    sendSuccess(res, { status: "ok" });
  });

  app.use("/athos_adm/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

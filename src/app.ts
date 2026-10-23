import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { corsOptions } from "./config/cors";
import routes from "./routes";
import { requestContext } from "./middlewares/requestContext";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import { sendSuccess } from "./helpers/response.helper";
import { env } from "./config/env";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "10mb" }));
  app.use(pinoHttp());
  app.use(requestContext);

  app.get("/health", (_req, res) => {
    sendSuccess(res, { status: "ok" });
  });

  // Áudios enviados pelo admin; o player do site carrega de outra origem.
  app.use(
    "/athos_adm/api/uploads",
    (_req, res, next) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      next();
    },
    express.static(env.UPLOAD_DIR, { maxAge: "30d", immutable: true, index: false, dotfiles: "deny" }),
  );

  app.use("/athos_adm/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

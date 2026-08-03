import { createApp } from "./app";
import { connectDB } from "./config/mongoose";
import { env } from "./config/env";

async function bootstrap(): Promise<void> {
  await connectDB();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`Athos Management API rodando na porta ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar a API", error);
  process.exit(1);
});

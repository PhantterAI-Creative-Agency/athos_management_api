import { createApp } from "./app";
import { connectDB } from "./config/mongoose";
import { env } from "./config/env";
import { migrateLegacyJingles } from "./services/radio.service";
import { scheduleMercadoPagoTokenRefresh } from "./jobs/mercadopagoTokenRefresh.job";
import { scheduleMercadoPagoReconciliation } from "./jobs/mercadopagoPayment.job";

async function bootstrap(): Promise<void> {
  await connectDB();
  await migrateLegacyJingles().catch((error) => console.error("Falha ao migrar vinhetas antigas", error));

  await scheduleMercadoPagoTokenRefresh().catch((error) =>
    console.error("Falha ao agendar a renovação de tokens do Mercado Pago", error),
  );
  await scheduleMercadoPagoReconciliation().catch((error) =>
    console.error("Falha ao agendar a conciliação de pagamentos do Mercado Pago", error),
  );

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`Athos Management API rodando na porta ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Falha ao iniciar a API", error);
  process.exit(1);
});

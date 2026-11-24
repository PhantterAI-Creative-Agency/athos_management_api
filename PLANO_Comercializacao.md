# Plano de Implementação — Comercialização do Athos Management

**Versão:** 1.0
**Data:** 23/11/2026
**Requisitos:** [`URS_Comercializacao.md`](./URS_Comercializacao.md)
**Acompanhamento:** [`Status_Plano_Comercializacao.md`](./Status_Plano_Comercializacao.md)

---

## 1. Como usar este plano

- As sprints estão em **ordem de dependência**. A duração sugerida é de 1 a 2 semanas, conforme as horas disponíveis por semana.
- Cada tarefa indica o repositório: **API** (`athos_management_api`), **WEB** (site e painel em Next.js) e **APP** (`athos_management_mobile`, Expo).
- **Ao final de cada sprint**, atualize o [`Status_Plano_Comercializacao.md`](./Status_Plano_Comercializacao.md): marque as tarefas, registre a data, o que ficou pendente e as decisões tomadas.
- Regra de foco: nada fora deste plano entra sem pedido de cliente pagante.

## 2. Visão geral

| Sprint | Tema | Requisitos (URS) | Bloqueia a venda? |
|---|---|---|---|
| 0 | Fundação: documentos legais versionados, registro de aceites, feature flags | LEG-01, LEG-06, TEN-06 | Sim |
| 1 | Termos, Política de Privacidade, Contrato e DPA | LEG-02 a LEG-09 | Sim |
| 2 | Consentimento dos membros (LGPD) | LGPD-01 a LGPD-07 | Sim |
| 3 | PIX provisório e remoção do fluxo simulado | PAG-01 a PAG-04 | Sim |
| 4 | Mercado Pago: OAuth da conta da igreja | MP-01 a MP-03 | Sim |
| 5 | Mercado Pago: cobrança PIX e webhook seguro | MP-04 a MP-11 | Sim |
| 6 | Rádio opcional com aceite | RAD-01 a RAD-06 | Sim (igreja-piloto) |
| 7 | Multi-igreja: temas e onboarding pelo painel | TEN-01 a TEN-09 | Sim |
| 8 | Planos comerciais e cobrança das igrejas | COB-01 a COB-05 | Parcial |
| 9 | Tesouraria (a detalhar) | §10 da URS | Não |

As sprints 1 e 2 dependem da 0. A 5 depende da 4. A 6 depende da 0. A 8 depende da 0 e da 7. A Sprint 3 pode ser feita em paralelo com a 1 e a 2.

---

## Sprint 0 — Fundação

**Objetivo:** criar a base que as sprints jurídicas, a rádio e os planos usam.

| # | Tarefa | Repo |
|---|---|---|
| 0.1 | Model `LegalDocument`: `type` (`terms`, `privacy`, `saas_contract`, `dpa`, `radio_liability`, `sensitive_data_consent`), `version`, `content` (markdown com placeholders), `contentHash` (SHA-256), `publishedAt`, `requiresReacceptance`. | API |
| 0.2 | Model `LegalAcceptance` (somente inserção): `action` (`accept`/`revoke`), `userId`, `churchId`, `documentId`, `documentType`, `version`, `contentHash`, `renderedHash`, `ip`, `forwardedFor`, `userAgent`, `onBehalfOfUserId` (para menores), `signer` (nome, CPF, cargo, CNPJ — só para contrato). A revogação é um novo registro, não uma edição. | API |
| 0.3 | Service e rotas: `GET /legal/:type/current?churchId=` (público, já com o nome da igreja preenchido), `POST /legal/:type/accept` (autenticado, grava IP/UA a partir da request), `GET /legal/pending` (documentos que o usuário ainda precisa aceitar). | API |
| 0.4 | Bloquear updates e deletes em `LegalAcceptance` no nível do model (hooks Mongoose) e registrar no `AuditLog`. | API |
| 0.5 | Feature flags em `Church.settings.features`: `radio` (padrão `false`), `ads`, `aiAssistant`, `onlineOfferings`. Middleware `requireFeature(name)`. Migrar `adsEnabled` para `features.ads` mantendo compatibilidade. | API |
| 0.6 | Script de migração: igreja-piloto com `radio: true` provisoriamente, até o aceite da Sprint 6. | API |
| 0.7 | Testes de integração de aceite, pendências e feature flags. | API |

**Pronto quando:** é possível publicar uma versão de documento, aceitar, listar pendências e bloquear uma rota por feature flag, com testes passando.

---

## Sprint 1 — Termos, Política de Privacidade, Contrato e DPA

**Objetivo:** ter a base jurídica publicada, genérica e versionada, pronta para revisão do advogado.

| # | Tarefa | Repo |
|---|---|---|
| 1.1 | Reescrever os Termos de Uso de forma genérica (`{{churchName}}`, `{{churchCnpj}}`), separando o papel da igreja (controladora) e do Athos (operador). Remover "Princípios de Vida" fixo. | API (conteúdo) |
| 1.2 | Redigir a Política de Privacidade: dados coletados, bases legais, dados sensíveis (religião, saúde), crianças e adolescentes, operadores (Mercado Pago, OpenRouter, Hostinger, Gmail SMTP, Expo/Firebase), retenção, direitos do titular, canal do encarregado. | API (conteúdo) |
| 1.3 | Redigir a minuta do Contrato SaaS: objeto, planos, implantação, pagamento, inadimplência, SLA, suporte, rescisão, devolução dos dados, cláusula de rádio/conteúdo, limitação de responsabilidade. | API (conteúdo) |
| 1.4 | Redigir o DPA (anexo): finalidades, instruções da controladora, suboperadores, segurança, incidentes, exclusão ao fim do contrato. | API (conteúdo) |
| 1.5 | Semear os documentos v1 no banco (script de seed). | API |
| 1.6 | Página pública de Política de Privacidade e Termos lidos da API (substituir o texto fixo). | WEB, APP |
| 1.7 | Fluxo de aceite do contrato pelo representante legal no painel: formulário com nome, CPF, cargo e CNPJ, exibição do texto integral, checkbox e confirmação. Bloquear o uso do painel até o aceite. | WEB, API |
| 1.8 | Modal de reaceite quando houver versão nova (`GET /legal/pending`). | WEB, APP |
| 1.9 | Exportação da evidência de aceite por igreja (JSON; PDF opcional). | API |
| 1.10 | Enviar o pacote (Termos, Política, Contrato, DPA) ao advogado e incorporar a revisão em uma v2. | Não técnica |

**Pronto quando:** os quatro documentos estão publicados, o representante legal consegue aceitar com evidência registrada e o pacote foi enviado ao advogado.

---

## Sprint 2 — Consentimento dos membros (LGPD)

**Objetivo:** tratar dados sensíveis e de menores com consentimento específico.

| # | Tarefa | Repo |
|---|---|---|
| 2.1 | Cadastro com dois blocos: aceite de Termos + Política (obrigatório) e consentimento de dados sensíveis (opcional, separado). | WEB, APP, API |
| 2.2 | API recusa gravar `medicalRecord` sem consentimento ativo (`403 CONSENT_REQUIRED`). | API |
| 2.3 | Consentimento em nome do menor ao vincular ou cadastrar filho (`onBehalfOfUserId`), com validação de que o usuário é responsável (`family.helper`). | API, WEB, APP |
| 2.4 | Revogação: `POST /legal/sensitive_data_consent/revoke` (já existe desde a Sprint 0) passa a apagar `medicalRecord` (e dos filhos, se aplicável). | API |
| 2.5 | Usuários existentes: ocultar dados sensíveis até o consentimento e pedir o consentimento no próximo login. | API, WEB, APP |
| 2.6 | Ampliar a solicitação de exclusão de dados para cobrir dados sensíveis e de filhos. | API |
| 2.7 | Exportação dos dados do titular (`GET /users/me/export`, JSON) e botão "Baixar meus dados". | API, WEB, APP |
| 2.8 | Testes: gravação bloqueada sem consentimento, revogação, consentimento por responsável. | API |

**Pronto quando:** nenhum dado de saúde ou de menor é gravado ou exibido sem consentimento registrado.

---

## Sprint 3 — PIX provisório e fim do fluxo simulado

**Objetivo:** ter ofertas honestas funcionando hoje, sem confirmação automática.

| # | Tarefa | Repo |
|---|---|---|
| 3.1 | Campo `Church.pix`: `keyType` (`cpf`, `cnpj`, `email`, `phone`, `random`), `key`, `receiverName`, `city`. Validação por tipo. | API |
| 3.2 | Gerar o BR Code estático (EMV) a partir da chave e devolver o payload copia-e-cola e o QR Code. | API |
| 3.3 | Tela no painel para cadastrar a chave PIX. | WEB |
| 3.4 | Tela de ofertas (site e app) com chave, botão copiar, QR Code e aviso de que a confirmação não é automática. | WEB, APP |
| 3.5 | Remover `stripe` e `pagarme` de `PAYMENT_PROVIDERS` (manter leitura de registros antigos, se existirem); padrão passa a `mercadopago`. Remover a dependência `stripe` do `package.json`. | API |
| 3.6 | Desligar `createCheckout` mock em produção (erro explícito se `APP_ENV=production` sem integração). | API |
| 3.7 | Fechar o webhook atual (`/payments/webhook`) até a Sprint 5, ou exigir segredo provisório. | API |

**Pronto quando:** em produção não há como gerar pagamento falso, e o membro consegue ofertar pela chave da igreja.

---

## Sprint 4 — Mercado Pago: OAuth da conta da igreja

**Objetivo:** cada igreja conecta a própria conta Mercado Pago.

| # | Tarefa | Repo |
|---|---|---|
| 4.1 | Criar a aplicação no painel de desenvolvedores do Mercado Pago (conta do Athos) e definir a URL de redirecionamento. Variáveis: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `MP_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY` em `config/env.ts`. | API |
| 4.2 | Model `PaymentAccount`: `churchId`, `provider: "mercadopago"`, `mpUserId`, `accessToken` e `refreshToken` criptografados, `expiresAt`, `publicKey`, `liveMode`, `connectedBy`, `connectedAt`, `status`. | API |
| 4.3 | Helper de criptografia (AES-256-GCM) com testes. | API |
| 4.4 | `GET /payments/mercadopago/connect`: gera a URL de autorização com `state` assinado (churchId + nonce, expira em 10 min) e PKCE, se disponível. | API |
| 4.5 | `GET /payments/mercadopago/callback`: valida `state`, troca `code` por tokens, grava a conta e redireciona ao painel. | API |
| 4.6 | Job BullMQ de renovação de token (rodar diariamente; renovar se faltar menos de 30 dias). | API |
| 4.7 | `GET /payments/mercadopago/status` e `DELETE /payments/mercadopago` (desconectar). | API |
| 4.8 | Painel: card "Conectar Mercado Pago", com status, conta conectada e botão de desconectar. | WEB |
| 4.9 | Testes com o servidor OAuth simulado (troca de code, state inválido, renovação). | API |

**Pronto quando:** uma igreja de teste conecta e desconecta a conta, e os tokens ficam criptografados e são renovados.

---

## Sprint 5 — Mercado Pago: cobrança PIX e webhook seguro

**Objetivo:** PIX real, com o dinheiro na conta da igreja e confirmação automática.

| # | Tarefa | Repo |
|---|---|---|
| 5.1 | Substituir o stub de `paymentProvider.helper.ts` por `POST /v1/payments` (`payment_method_id: "pix"`) usando o **access token da igreja**, com `X-Idempotency-Key`, `external_reference` = id da oferta, `notification_url` e `date_of_expiration`. Sem `application_fee`. | API |
| 5.2 | Devolver `qr_code` e `qr_code_base64` de `point_of_interaction.transaction_data`. | API |
| 5.3 | Fallback: igreja sem conta conectada usa o PIX estático da Sprint 3. | API |
| 5.4 | Webhook: validar `x-signature` (HMAC-SHA256 com `MP_WEBHOOK_SECRET` sobre `id`, `x-request-id` e `ts`), rejeitar `ts` antigo, responder 200 rápido e enfileirar. | API |
| 5.5 | Worker: identificar a igreja (`user_id` do evento → `PaymentAccount`), consultar `GET /v1/payments/:id` com o token da igreja, mapear o status (`approved` → `paid`, `rejected`/`cancelled` → `failed`, `refunded` → `refunded`, `expired`). Nunca confiar só no corpo do webhook. | API |
| 5.6 | Idempotência: tabela de eventos processados (id do evento) e transição de status só para frente. | API |
| 5.7 | Inscrição em evento pago confirmada pelo webhook (reaproveitar `confirmEventRegistrationPayment`). | API |
| 5.8 | Job de reconciliação: pagamentos `pending` há mais de 15 min são consultados no Mercado Pago. Expiração marca `failed`/`expired`. | API |
| 5.9 | Telas de oferta no site e no app: QR Code, copia-e-cola, contagem regressiva e atualização do status (polling curto ou push). | WEB, APP |
| 5.10 | Testes: assinatura válida e inválida, evento duplicado, igreja errada, reconciliação. | API |
| 5.11 | Teste ponta a ponta em produção com valor real baixo na conta da igreja-piloto. | Manual |

**Pronto quando:** um PIX real cai na conta da igreja e o status vira `paid` apenas por webhook validado.

---

## Sprint 6 — Rádio opcional com aceite

**Objetivo:** rádio fora da oferta principal, ativada só com aceite de responsabilidade.

| # | Tarefa | Repo |
|---|---|---|
| 6.1 | Documento `radio_liability` v1: texto direto sobre direitos autorais, ECAD e responsabilidade da igreja. | API (conteúdo) |
| 6.2 | Ativação: `POST /legal/radio_liability/accept` seguido de `PATCH /churches/me/features { radio: true }` (a API já recusa com 422 sem aceite vigente desde a Sprint 0). Falta publicar o texto e, opcionalmente, desligar a rádio ao revogar o termo. | API |
| 6.3 | Aplicar `requireFeature("radio")` em todas as rotas de rádio e de upload de áudio. | API |
| 6.4 | Modal de ativação no painel com o texto, checkbox e confirmação. | WEB |
| 6.5 | Ocultar menus e telas da rádio no site e no app quando a flag estiver desligada. | WEB, APP |
| 6.6 | Igreja-piloto: trocar a ativação provisória (0.6) pelo aceite real do administrador. | Manual |

**Pronto quando:** nenhuma igreja tem a rádio ativa sem aceite registrado.

---

## Sprint 7 — Multi-igreja: temas e onboarding

**Objetivo:** colocar uma igreja nova no ar pelo painel, sem deploy.

| # | Tarefa | Repo |
|---|---|---|
| 7.1 | Ampliar `Church.settings.theme`: `secondaryColor`, `fontFamily` (lista fechada), `faviconUrl`, `homeSections` (ordem e visibilidade). | API |
| 7.2 | Campo `Church.domains` e resolução da igreja por host (`GET /public/church-by-host`). | API |
| 7.3 | Site: resolver a igreja pelo host, aplicar o tema via CSS variables e renderizar a home pela ordem configurada. Ler o guia do Next.js em `node_modules/next/dist/docs/` antes de alterar o middleware/proxy. | WEB |
| 7.4 | Editor de tema no painel, com pré-visualização. | WEB |
| 7.5 | Papel `super_admin` (Athos) e fluxo de criação de igreja: dados, slug, domínio, primeiro administrador (convite por e-mail), plano. | API, WEB |
| 7.6 | Importação de membros por CSV, com relatório de erros. | API, WEB |
| 7.7 | Domínios na Hostinger: documentar o passo a passo de apontar subdomínio/domínio próprio da igreja. | Docs |
| 7.8 | Métricas por igreja: bytes em `UPLOAD_DIR/<churchId>`, chamadas de IA, número de membros. Limite de armazenamento por igreja. | API |
| 7.9 | Decisão P3 (app único ou app com a marca de cada igreja) e implementação da escolha. Ler a documentação do Expo v57 antes. | APP |
| 7.10 | Ensaio: criar uma igreja fictícia do zero e cronometrar o tempo de implantação. | Manual |

**Pronto quando:** uma igreja fictícia entra no ar só pelo painel, e o tempo de implantação está medido.

---

## Sprint 8 — Planos comerciais e cobrança das igrejas

**Objetivo:** cobrar a mensalidade e liberar recursos por plano.

| # | Tarefa | Repo |
|---|---|---|
| 8.1 | Decidir P1 — **decidido: Mercado Pago (conta da PhantterAI), PIX e Assinaturas no cartão**. | Decisão |
| 8.2 | Model `Subscription`: `churchId`, `plan` (`essencial`, `completo`), `status` (`trial`, `active`, `past_due`, `canceled`), `currentPeriodEnd`, `providerSubscriptionId`. | API |
| 8.3 | Mapear plano → feature flags (Completo libera IA, anúncios, rádio e PIX integrado). | API |
| 8.4 | Integração de cobrança recorrente (PIX e assinatura no cartão) e webhook validado de pagamento da mensalidade. | API |
| 8.5 | Carência e modo somente leitura para inadimplentes, com avisos por e-mail. | API, WEB |
| 8.6 | Tela "Meu plano" no painel: plano atual, próxima cobrança, faturas. | WEB |
| 8.7 | Registro da taxa de implantação como cobrança única. | API |

**Pronto quando:** uma igreja de teste assina, paga, fica inadimplente e é reativada, com os recursos mudando conforme o plano.

---

## Sprint 9 — Tesouraria (a detalhar)

Só começa depois de levantar os requisitos com a igreja-piloto (P5 da URS). Esboço inicial:

- Model de lançamentos (entrada/saída, categoria, data, comprovante).
- Entrada automática a partir das ofertas pagas da Sprint 5.
- Relatório mensal e exportação para prestação de contas.
- Papel `treasurer` no RBAC.

---

## 3. Atividades não técnicas (em paralelo)

| Quando | Atividade |
|---|---|
| Já | Conversar com o pastor da igreja-piloto, gravar depoimento, pedir 3 a 4 indicações. |
| Sprint 1 | Contratar e enviar o pacote ao advogado. |
| Sprint 5 | Roteiro de demonstração de 15 minutos. |
| Sprint 7 | Pesquisa de preços de concorrentes e decisão P4. |

## 4. Riscos

| Risco | Mitigação |
|---|---|
| Revisão jurídica atrasa o lançamento | Enviar o pacote cedo (Sprint 1) e seguir com as sprints técnicas em paralelo. |
| Mudança de API ou regras do Mercado Pago | Isolar a integração em `paymentProvider.helper.ts` e cobrir com testes. Conferir a documentação oficial ao iniciar as sprints 4 e 5. |
| Webhook perdido | Job de reconciliação (5.8). |
| Vazamento de token | Criptografia em repouso, logs sem segredos, rotação de `TOKEN_ENCRYPTION_KEY` documentada. |
| Excesso de escopo | Regra de foco: só entra o que cliente pagante pedir. |
| Custo de armazenamento dos áudios | Limite por igreja (7.8) e rádio fora do plano Essencial. |

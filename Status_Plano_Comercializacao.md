# Status — Plano de Comercialização

**Plano:** [`PLANO_Comercializacao.md`](./PLANO_Comercializacao.md)
**Requisitos:** [`URS_Comercializacao.md`](./URS_Comercializacao.md)
**Última atualização:** 23/11/2026 (fim da Sprint 3)

> **Como atualizar (ao final de cada sprint):**
> 1. Marque as tarefas concluídas com `[x]` e as parciais com `[~]`.
> 2. Atualize a tabela de resumo (status, datas e percentual).
> 3. Registre no histórico o que foi entregue, o que ficou pendente e por quê.
> 4. Registre novas decisões na seção de decisões e retire as pendências resolvidas.
> 5. Atualize a data de "Última atualização".
>
> Legenda: `[ ]` a fazer · `[~]` parcial · `[x]` concluída · `[-]` cancelada

---

## Resumo

| Sprint | Tema | Status | Início | Fim | Progresso |
|---|---|---|---|---|---|
| 0 | Fundação (documentos legais, aceites, feature flags) | Concluída | 23/11/2026 | 23/11/2026 | 7/7 |
| 1 | Termos, Política, Contrato e DPA | Concluída (exceto revisão jurídica) | 23/11/2026 | 23/11/2026 | 9/10 |
| 2 | Consentimento dos membros (LGPD) | Concluída | 23/11/2026 | 23/11/2026 | 8/8 |
| 3 | PIX provisório e fim do fluxo simulado | Concluída | 23/11/2026 | 23/11/2026 | 7/7 |
| 4 | Mercado Pago: OAuth | Não iniciada | — | — | 0/9 |
| 5 | Mercado Pago: PIX e webhook | Não iniciada | — | — | 0/11 |
| 6 | Rádio opcional com aceite | Não iniciada | — | — | 0/6 |
| 7 | Multi-igreja: temas e onboarding | Não iniciada | — | — | 0/10 |
| 8 | Planos comerciais e cobrança | Não iniciada | — | — | 0/7 |
| 9 | Tesouraria | Aguardando requisitos | — | — | — |

**Critérios para o primeiro cliente pagante (URS §11):** 0/6 atendidos.

- [ ] Nenhum fluxo simulado de pagamento acessível em produção
- [ ] PIX real recebido na conta da igreja e confirmado por webhook validado
- [ ] Termos, Política, Contrato e DPA publicados, versionados e revisados por advogado
- [ ] Aceite do representante legal e consentimentos dos membros registrados
- [ ] Rádio só funciona após aceite registrado
- [ ] Igreja nova entra no ar pelo painel, sem deploy manual

---

## Sprint 0 — Fundação

- [x] 0.1 Model `LegalDocument` — `src/models/LegalDocument.model.ts`
- [x] 0.2 Model `LegalAcceptance` (somente inserção) — `src/models/LegalAcceptance.model.ts`
- [x] 0.3 Rotas `/legal/:type/current`, `/legal/:type/accept`, `/legal/pending` (+ `/legal/:type/revoke`, `GET/POST /legal/documents`) — `src/routes/legal.routes.ts`
- [x] 0.4 Bloqueio de update/delete em aceites e documentos + `AuditLog` (`ACCEPT`/`REVOKE`) — `src/helpers/immutable.helper.ts`
- [x] 0.5 Feature flags em `Church.settings.features` + `requireFeature` + `GET/PATCH /churches/me/features` — `src/helpers/features.helper.ts`, `src/middlewares/requireFeature.ts`
- [x] 0.6 Migração da igreja-piloto (`radio: true` provisório) — `src/migrations/enablePilotRadio.ts` (**ainda não executada em produção**)
- [x] 0.7 Testes de integração — `legal.integration.test.ts` (20) e `features.integration.test.ts` (11)

**Entregue além do previsto:**
- Validação de CPF e CNPJ do representante legal (`src/helpers/brDocument.helper.ts`); CPF mascarado nas respostas.
- Aceite em nome de menor já validado pelo vínculo familiar (`isFamilyManager`) — adianta parte da Sprint 2.
- A API já recusa ligar a rádio sem aceite vigente de `radio_liability` (422) — adianta parte da Sprint 6.
- `requireFeature` aplicado ao assistente de IA (`POST /ai-chat/messages`) e à criação de ofertas (`POST /offerings`). A rádio **ainda não** é bloqueada pela flag (fica para a 6.3, para não derrubar a igreja-piloto antes da migração).
- Correção de bug: salvar configurações da igreja (`PATCH /churches/me`) ou de anúncios (`PATCH /ads/settings`) sobrescrevia `settings` inteiro e apagava o `youtubeChannelId`. Agora a atualização é campo a campo.

## Sprint 1 — Termos, Política de Privacidade, Contrato e DPA

- [x] 1.1 Termos de Uso genéricos — `src/content/legal/terms.md`
- [x] 1.2 Política de Privacidade — `src/content/legal/privacy.md`
- [x] 1.3 Minuta do Contrato SaaS — `src/content/legal/saas_contract.md`
- [x] 1.4 DPA — `src/content/legal/dpa.md`
- [x] 1.5 Publicação dos documentos — `npm run legal:publish` (`src/migrations/publishLegalDocuments.ts`; **ainda não executado em produção**)
- [x] 1.6 Páginas públicas lidas da API — site: `/termos-de-servico` e `/politica-de-privacidade` (nova); app: telas `termos-de-servico` e `politica-de-privacidade` (nova); links no rodapé, login, cadastro e perfil
- [x] 1.7 Aceite do contrato e do DPA pelo representante legal — site: `ChurchContractGate` bloqueia o painel até o aceite (nome, CPF, cargo, CNPJ, declaração de poderes)
- [x] 1.8 Modal de aceite/reaceite de Termos e Política — site (`LegalPendingModal`) e app (`LegalPendingModal`, tela cheia)
- [x] 1.9 Exportação da evidência — `GET /legal/evidence` + página "Documentos legais" no painel com download em JSON
- [ ] 1.10 Revisão do advogado incorporada (v2) — **pendente** (não técnica)

**Validação:** 10 testes novos na API (suíte: 405 passando); build do site ok; fluxo ponta a ponta testado no navegador (Playwright): Política pública com o e-mail da igreja → modal de aceite do membro → modal + bloqueio do contrato para o admin → aceite com CPF/CNPJ mascarados → página "Documentos legais" com os dois aceites. O teste visual achou e corrigiu um bug (placeholder `{{platformName}}` aparecia cru no título). App: typecheck e lint sem erros novos; não foi executado em aparelho/simulador.

## Sprint 2 — Consentimento dos membros (LGPD)

- [x] 2.1 Cadastro com aceite e consentimento separados — `POST /auth/register` aceita `legalAcceptances`; site e app têm checkbox obrigatório (Termos + Política) e checkbox opcional separado (dados de saúde)
- [x] 2.2 Bloqueio de `medicalRecord` sem consentimento — `403 CONSENT_REQUIRED`, inclusive para o admin
- [x] 2.3 Consentimento em nome de menores — tela do filho (site e app); o consentimento pertence ao titular, então vale o dado por qualquer responsável
- [x] 2.4 Revogação — `POST /legal/sensitive_data_consent/revoke` apaga a ficha médica do titular; botão "Revogar" no perfil e na tela do filho
- [x] 2.5 Usuários existentes — ficha médica sem consentimento fica oculta para todos (inclusive admin); o perfil mostra o pedido de consentimento
- [x] 2.6 Exclusão de dados — opção "incluir dados dos filhos" (site e app), texto deixa claro que inclui dados sensíveis
- [x] 2.7 Exportação dos dados do titular — `GET /users/me/export`; site: "Baixar meus dados" (JSON); app: "Baixar meus dados" em Configurações (compartilha o JSON)
- [x] 2.8 Testes — `consent.integration.test.ts` (16) + ajuste em `users.integration.test.ts`

**Validação:** suíte da API: 422 testes passando. Site: build ok e fluxo testado no navegador (cadastro bloqueado sem aceite → cadastro com aceite e consentimento → "Meus dados" sem consentimento salva normalmente → autorizar → ficha liberada → revogar → ficha apagada). App: typecheck e lint sem erros novos; não executado em aparelho.

**Bug evitado:** as telas "Meus dados" (site, app e painel) sempre enviavam a ficha médica ao salvar. Com o bloqueio novo, quem não consentiu não conseguiria salvar nada. Agora a ficha só é enviada com consentimento.

## Sprint 3 — PIX provisório e fim do fluxo simulado

- [x] 3.1 Campo `Church.pix` (tipo, chave normalizada, recebedor, cidade) + `GET/PUT/DELETE /churches/me/pix` (admin)
- [x] 3.2 BR Code estático — `src/helpers/pix.helper.ts` (CRC16 validado contra o exemplo do manual do Banco Central) + QR Code PNG (`qrcode`) em `GET /offerings/pix`
- [x] 3.3 Painel: página "Ofertas (PIX)" com cadastro da chave e pré-visualização
- [x] 3.4 Tela de ofertas (site e app): valor opcional → QR + copia e cola + chave, com aviso de que não há confirmação automática
- [x] 3.5 Só `mercadopago` aceito em novas cobranças (Stripe/Pagar.me recusados; registros antigos continuam válidos); dependência `stripe` removida
- [x] 3.6 Cobrança simulada só com `PAYMENTS_MOCK_ENABLED=true` ou em testes; em produção `POST /offerings` responde 409 e inscrições pagas usam o PIX da igreja com confirmação manual
- [x] 3.7 Webhook exige `X-Webhook-Secret` = `PAYMENT_WEBHOOK_SECRET`; sem a variável, fica desligado (404)

**Validação:** suíte da API: 441 testes (19 novos). Site: build ok e fluxo testado no navegador (chave inválida recusada → chave salva com pré-visualização → membro gera PIX de R$ 50 com QR e chave). App: typecheck e lint sem erros novos; não executado em aparelho.

**Bugs corrigidos:** o app enviava `provider: 'pix'` ao se inscrever em eventos e ao ofertar — valor que a API recusa — então **inscrição em qualquer evento pelo app falhava** e a tela de ofertas do app não funcionava. Corrigido.

## Sprint 4 — Mercado Pago: OAuth

- [ ] 4.1 Aplicação no Mercado Pago + variáveis de ambiente
- [ ] 4.2 Model `PaymentAccount`
- [ ] 4.3 Helper de criptografia
- [ ] 4.4 Rota `connect` com `state` assinado
- [ ] 4.5 Rota `callback`
- [ ] 4.6 Job de renovação de token
- [ ] 4.7 Rotas de status e desconexão
- [ ] 4.8 Card "Conectar Mercado Pago" no painel
- [ ] 4.9 Testes

## Sprint 5 — Mercado Pago: PIX e webhook

- [ ] 5.1 Criação do pagamento PIX com o token da igreja
- [ ] 5.2 QR Code e copia-e-cola reais
- [ ] 5.3 Fallback para PIX estático
- [ ] 5.4 Validação de `x-signature`
- [ ] 5.5 Worker com consulta do pagamento na API
- [ ] 5.6 Idempotência
- [ ] 5.7 Confirmação de inscrição em evento pago
- [ ] 5.8 Job de reconciliação e expiração
- [ ] 5.9 Telas de oferta no site e no app
- [ ] 5.10 Testes
- [ ] 5.11 Teste real em produção na igreja-piloto

## Sprint 6 — Rádio opcional com aceite

- [ ] 6.1 Documento `radio_liability` v1
- [ ] 6.2 Rotas de ativar/desativar com aceite
- [ ] 6.3 `requireFeature("radio")` nas rotas
- [ ] 6.4 Modal de ativação no painel
- [ ] 6.5 Ocultar rádio no site e no app
- [ ] 6.6 Aceite real da igreja-piloto

## Sprint 7 — Multi-igreja: temas e onboarding

- [ ] 7.1 `Church.settings.theme` ampliado
- [ ] 7.2 Domínios e resolução por host
- [ ] 7.3 Site com tema e home configuráveis
- [ ] 7.4 Editor de tema no painel
- [ ] 7.5 `super_admin` e criação de igreja
- [ ] 7.6 Importação de membros por CSV
- [ ] 7.7 Guia de domínios na Hostinger
- [ ] 7.8 Métricas e limite de armazenamento por igreja
- [ ] 7.9 Decisão e implementação do modelo do app (P3)
- [ ] 7.10 Ensaio de implantação cronometrado

## Sprint 8 — Planos comerciais e cobrança

- [ ] 8.1 Decisão P1 (Mercado Pago Assinaturas ou Asaas)
- [ ] 8.2 Model `Subscription`
- [ ] 8.3 Plano → feature flags
- [ ] 8.4 Cobrança recorrente + webhook
- [ ] 8.5 Carência e modo somente leitura
- [ ] 8.6 Tela "Meu plano"
- [ ] 8.7 Taxa de implantação

## Sprint 9 — Tesouraria

- [ ] Levantar requisitos com a igreja-piloto (P5)

---

## Atividades não técnicas

- [ ] NT-01 Conversa com o pastor da igreja-piloto (uso e necessidades)
- [ ] NT-02 Depoimento em vídeo
- [ ] NT-03 3 a 4 indicações de pastores
- [ ] NT-04 Revisão jurídica contratada — minutas prontas em `src/content/legal/` para enviar ao advogado
- [ ] NT-05 Roteiro de demonstração e mensagem de indicação

## Decisões tomadas durante a execução

| Data | Sprint | Decisão |
|---|---|---|
| 23/11/2026 | 0 | Revogação é um **novo registro** (`action: "revoke"`), não um campo `revokedAt` editável. O estado vigente é o registro mais recente. Mantém a coleção 100% somente inserção. |
| 23/11/2026 | 0 | O recurso `ads` continua gravado em `settings.adsEnabled` (campo legado usado pelos clientes); `settings.features` guarda só `radio`, `aiAssistant` e `onlineOfferings`. |
| 23/11/2026 | 0 | Documentos legais são **globais da plataforma** (publicados por `devAdmin`), com placeholders `{{churchName}}`, `{{churchSlug}}`, `{{platformName}}`. O aceite guarda o hash do modelo e o hash do texto exibido. |
| 23/11/2026 | 0 | Versão publicada com `requiresReacceptance: false` (correção menor) não gera novo aceite; a v1 sempre exige. |
| 23/11/2026 | 0 | Aceites de escopo "igreja" (Contrato, DPA, rádio) só podem ser feitos por `admin`. |
| 23/11/2026 | 1 | Os textos legais vivem em `src/content/legal/*.md` (versionados no git) e são publicados no banco por script; a API de publicação (`POST /legal/documents`) continua disponível para o `devAdmin`. |
| 23/11/2026 | 1 | O contrato e o DPA são aceitos juntos, com os mesmos dados do representante legal, no painel web. O app não tem painel administrativo, então lá só existe o aceite de Termos e Política. |
| 23/11/2026 | 1 | O bloqueio do painel até o aceite do contrato é feito no site (front-end); a API ainda não recusa ações administrativas de igrejas sem contrato aceito. Avaliar bloqueio no servidor antes de vender para terceiros. |
| 23/11/2026 | 1 | O cadastro (site e app) ainda não tem checkbox de aceite; o aceite acontece no primeiro acesso, pelo modal. O checkbox separado de dados sensíveis entra na Sprint 2 (2.1). |
| 23/11/2026 | 2 | O consentimento de dados sensíveis pertence ao **titular**: vale o mais recente entre o do próprio titular e o de qualquer responsável. Assim, pai e mãe compartilham o mesmo consentimento do filho e qualquer um pode revogar. |
| 23/11/2026 | 2 | O aceite no cadastro é **opcional na API** para não quebrar versões antigas do app nas lojas; quem não enviar aceita pelo modal no primeiro acesso. Site e app novos exigem o checkbox. |
| 23/11/2026 | 2 | Fichas médicas antigas, sem consentimento, ficam **ocultas, não apagadas**. Pendente: definir com o advogado um prazo para apagá-las se o consentimento não vier. |
| 23/11/2026 | 2 | A exclusão de dados continua sendo um pedido atendido manualmente (e-mail para a equipe); a automação da exclusão não estava no escopo. |
| 23/11/2026 | 3 | O QR Code é gerado na API (PNG em data URL) para o site; o app desenha o QR a partir do copia e cola (já tinha `react-native-qrcode-svg`). |
| 23/11/2026 | 3 | Oferta por PIX estático **não cria registro** de oferta (não há como confirmar). O histórico mostra só ofertas confirmadas pelo sistema; a tela avisa isso. |
| 23/11/2026 | 3 | Inscrição em evento pago sem pagamento on-line: fica "registrada" e o PIX leva o id da inscrição no campo txid, para a secretaria conferir no extrato. Sem chave cadastrada, a inscrição é aceita e o membro é orientado a combinar com a secretaria. |
| 23/11/2026 | 0 | Migrações ficam em `src/migrations/` porque `**/scripts/` está no `.gitignore`. |
| 23/11/2026 | 0 | O app não define `trust proxy`; por isso o aceite grava `ip` e também o cabeçalho `X-Forwarded-For` bruto. Revisar se o proxy da Hostinger exige `app.set("trust proxy", ...)`. |

## Decisões pendentes

| # | Pendência | Prazo | Situação |
|---|---|---|---|
| P1 | Mercado Pago Assinaturas ou Asaas para mensalidades | Antes da Sprint 8 | Aberta |
| P2 | Advogado para a revisão | Sprint 1 | Aberta |
| P3 | App único ou app com a marca de cada igreja | Antes da Sprint 7 | Aberta |
| P4 | Preços finais | Antes do primeiro cliente | Aberta (hipótese: R$ 300–500 + R$ 97/R$ 197) |
| P5 | Escopo da tesouraria | Após a Sprint 8 | Aberta |

## Histórico de sprints

| Data | Sprint | Entregue | Pendente / observações |
|---|---|---|---|
| 23/11/2026 | — | URS, plano e este documento de status criados. | Nenhuma sprint iniciada. |
| 23/11/2026 | 3 | Chave PIX da igreja com BR Code/QR reais, painel "Ofertas (PIX)", telas de oferta no site e no app, inscrição paga com PIX e confirmação manual, fim das cobranças simuladas em produção, webhook protegido, Stripe removido. | **Antes do deploy:** cadastrar a chave PIX da igreja-piloto no painel (Ofertas (PIX)); **não** definir `PAYMENTS_MOCK_ENABLED` em produção; deixar `PAYMENT_WEBHOOK_SECRET` vazio (webhook desligado) até a Sprint 5. Inscrições pagas passam a ficar "registradas" até a secretaria confirmar (mudar para "confirmada" no painel de eventos). Publicar nova versão do app para corrigir as inscrições. |
| 23/11/2026 | 2 | Consentimento específico para ficha médica (próprio e de menores), bloqueio e ocultação sem consentimento, revogação que apaga os dados, aceite no cadastro, exportação de dados, exclusão incluindo filhos. Novo texto `sensitive_data_consent.md`. | **Antes do deploy:** rodar `npm run legal:publish` (agora também publica o termo de dados sensíveis). **Atenção:** após o deploy, as fichas médicas já cadastradas ficam ocultas até cada titular (ou responsável) consentir — avise a igreja-piloto. Os dados continuam no banco; decidir se serão apagados após um prazo sem consentimento (ver decisões). |
| 23/11/2026 | 1 | Minutas de Termos, Política, Contrato e DPA; publicação a partir de arquivos (`legal:publish`, idempotente, `--minor`); placeholders do fornecedor por variável de ambiente; exportação de evidências; páginas públicas, modal de aceite (site e app), bloqueio do painel até o aceite do contrato, página "Documentos legais". | **Antes do deploy:** definir `LEGAL_PROVIDER_NAME`, `LEGAL_PROVIDER_DOCUMENT`, `LEGAL_PROVIDER_EMAIL` e `LEGAL_FORUM_CITY` (senão os textos mostram `[RAZÃO SOCIAL DO FORNECEDOR]` etc.), cadastrar o e-mail de contato da igreja no painel, e rodar `npm run legal:publish` com `APP_ENV=production`. A partir daí **todos os usuários** verão o modal de aceite no próximo acesso e o **admin da igreja-piloto** ficará bloqueado no painel até aceitar o contrato. Recomendo publicar só depois da revisão do advogado (1.10), ou publicar já e publicar a v2 revisada depois (exigirá novo aceite). |
| 23/11/2026 | 0 | Documentos legais versionados e imutáveis, registro de aceites/revogações com evidência (IP, X-Forwarded-For, user-agent, hash do texto exibido), pendências por usuário/igreja, feature flags por igreja, migração da igreja-piloto, 31 testes novos (suíte: 395 passando). | **Antes do deploy:** rodar `npm run migrate:pilot-radio -- <slug-da-piloto>` com `APP_ENV=production` (usa `tsx`, que é dependência de desenvolvimento). Nenhum documento está publicado ainda: `/legal/pending` retorna vazio até a Sprint 1. Site e app ainda não consomem as rotas novas. |

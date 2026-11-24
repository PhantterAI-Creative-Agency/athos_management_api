# Status — Plano de Comercialização

**Plano:** [`PLANO_Comercializacao.md`](./PLANO_Comercializacao.md)
**Requisitos:** [`URS_Comercializacao.md`](./URS_Comercializacao.md)
**Última atualização:** 24/11/2026 (fim da Sprint 8)

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
| 4 | Mercado Pago: OAuth | Concluída (falta configurar a aplicação no Mercado Pago) | 23/11/2026 | 23/11/2026 | 8/9 |
| 5 | Mercado Pago: PIX e webhook | Concluída (falta o teste real) | 23/11/2026 | 23/11/2026 | 10/11 |
| 6 | Rádio opcional com aceite | Concluída (falta o aceite da igreja-piloto) | 23/11/2026 | 23/11/2026 | 5/6 |
| 7 | Multi-igreja: temas e onboarding | Concluída | 23/11/2026 | 24/11/2026 | 10/10 |
| 8 | Planos comerciais e cobrança | Concluída (falta configurar o Asaas de produção) | 24/11/2026 | 24/11/2026 | 7/7 |
| 9 | Tesouraria | Aguardando requisitos | — | — | — |

**Critérios para o primeiro cliente pagante (URS §11):** 4/6 atendidos no código (valem após o deploy).

- [x] Nenhum fluxo simulado de pagamento acessível em produção (Sprint 3)
- [~] PIX real recebido na conta da igreja e confirmado por webhook validado — código pronto (Sprint 5); falta o teste real (5.11)
- [ ] Termos, Política, Contrato e DPA publicados, versionados e revisados por advogado
- [x] Aceite do representante legal e consentimentos dos membros registrados (Sprints 1 e 2)
- [x] Rádio só funciona após aceite registrado (Sprint 6)
- [x] Igreja nova entra no ar pelo painel, sem deploy manual (Sprint 7; falta só apontar o domínio)

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

- [~] 4.1 Variáveis de ambiente prontas (`MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `MP_USE_PKCE`, `ADMIN_PANEL_URL`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`). **Pendente (ação do Rodrigo):** criar a aplicação no painel de desenvolvedores do Mercado Pago, cadastrar a URL de redirecionamento e ativar o PKCE
- [x] 4.2 Model `PaymentAccount` (tokens criptografados, `select: false`) + `OAuthState` (state de uso único, TTL de 10 min)
- [x] 4.3 Helper de criptografia AES-256-GCM (`src/helpers/crypto.helper.ts`)
- [x] 4.4 `GET /payments/mercadopago/connect`: state aleatório de uso único guardado no banco + PKCE S256 (code_verifier criptografado, nunca sai do servidor)
- [x] 4.5 `GET /payments/mercadopago/callback`: valida e consome o state, troca o código, grava a conta e volta ao painel com o resultado
- [x] 4.6 Renovação diária: BullMQ às 04:17 quando há Redis, ou `POST /internal/cron/mercadopago-refresh-tokens` (Bearer `CRON_SECRET`) num cron da Hostinger. Renova com menos de 30 dias para vencer; recusa do Mercado Pago marca "reconectar"
- [x] 4.7 `GET /payments/mercadopago/status` e `DELETE /payments/mercadopago`
- [x] 4.8 Card "Mercado Pago" no painel (página Ofertas), com conectar, status, aviso de reconexão e desconectar
- [x] 4.9 Testes: `mercadopago.integration.test.ts` (18) + `crypto.helper.test.ts` (4)

**Validação:** suíte da API: 463 testes. Fluxo ponta a ponta no navegador contra um servidor local que imita o OAuth do Mercado Pago: clicar em Conectar → autorização → retorno ao painel → "Conectada" (PKCE conferido pelo servidor falso) → desconectar. **Ainda não testado contra o Mercado Pago real**, porque depende da aplicação (4.1).

## Sprint 5 — Mercado Pago: PIX e webhook

- [x] 5.1 `POST /v1/payments` com o token da igreja, `X-Idempotency-Key` = id da oferta, `external_reference`, validade de 60 min, sem `application_fee` (`src/services/mercadopagoPayments.service.ts`)
- [x] 5.2 QR Code e copia e cola do Mercado Pago, guardados enquanto a oferta está pendente
- [x] 5.3 Modo por igreja (`GET /offerings/payment-options`): Mercado Pago conectado → PIX automático; só chave → PIX estático; nenhum → aviso
- [x] 5.4 `x-signature` validado com `MP_WEBHOOK_SECRET` (HMAC-SHA256 de `id:…;request-id:…;ts:…;`, janela de 15 min)
- [x] 5.5 Notificação vai para fila (BullMQ, 5 tentativas) ou é processada na hora; o pagamento é **sempre consultado na API** do Mercado Pago, conferindo referência e valor
- [x] 5.6 Idempotência: transições só para a frente (pendente → pago/falhou/expirado; pago → estornado); notificações repetidas não mudam nada
- [x] 5.7 Inscrição paga confirmada automaticamente quando o PIX é aprovado
- [x] 5.8 Conciliação a cada 10 min (BullMQ) ou `POST /internal/cron/mercadopago-reconcile`; PIX vencido vira "expirado"
- [x] 5.9 Telas (site e app): PIX com contagem regressiva e confirmação automática na tela; inscrição paga avisa que confirma sozinha
- [x] 5.10 Testes: `mercadopagoPayments.integration.test.ts` (13) + `mercadopagoPayments.helper.test.ts` (5)
- [ ] 5.11 Teste real em produção na igreja-piloto — **pendente** (depende da aplicação no Mercado Pago, Sprint 4.1)

**Validação:** suíte da API: 481 testes. Fluxo ponta a ponta no navegador contra um Mercado Pago simulado: membro gera PIX de R$ 25 → QR com contagem regressiva → pagamento aprovado + notificação → tela mostra "Pagamento confirmado!" sozinha. App: typecheck e lint sem erros novos; não executado em aparelho.

**A confirmar no primeiro teste real (5.11):** (1) o formato exato do texto assinado no `x-signature` — a documentação consultada não o detalha; se a validação recusar notificações legítimas, a conciliação de 10 em 10 minutos ainda confirma os pagamentos; (2) se o Mercado Pago exige CPF do pagador no PIX (hoje enviamos só e-mail e nome); (3) se as notificações de pagamentos feitos com o token da igreja chegam com assinatura.

## Sprint 6 — Rádio opcional com aceite

- [x] 6.1 Termo `radio_liability` v1 (`src/content/legal/radio_liability.md`), publicado por `npm run legal:publish`
- [x] 6.2 `GET /radio/status`, `POST /radio/activate` (aceite com evidência + liga numa só ação) e `POST /radio/deactivate`; revogar o termo desliga a rádio
- [x] 6.3 Todas as rotas de gestão e upload da rádio exigem rádio ligada **e** termo vigente aceito (`requireRadioActive`, 403 `RADIO_INACTIVE`); a rádio pública devolve programação vazia quando inativa
- [x] 6.4 Painel → Rádio: tela de ativação com aviso direto sobre ECAD, texto integral do termo e dois aceites expressos; botão "Desativar rádio"; aviso de novo aceite quando o termo muda
- [x] 6.5 Site: o player some sozinho (programação vazia). App: não tem rádio
- [ ] 6.6 Aceite real da igreja-piloto — **pendente (ação do admin após o deploy)**

**Validação:** suíte da API: 490 testes (9 novos + ajuste nos 13 da rádio). Site: build ok e fluxo testado no navegador (termo exibido → botão bloqueado até os dois aceites → rádio ativada com as abas de gestão).

## Sprint 7 — Multi-igreja: temas e onboarding

- [x] 7.1 `Church.settings.theme`: cor principal e secundária, fonte (lista fechada), favicon, foto do topo e ordem/visibilidade das seções da home; `PUT /churches/me/theme`
- [x] 7.2 `Church.domains` (únicos, normalizados sem `www.`/porta) e `GET /public/church-by-host`
- [x] 7.3 Site: `ChurchProvider` descobre a igreja pelo domínio (ou `NEXT_PUBLIC_CHURCH_SLUG` fixo); tema aplicado por variáveis CSS (claro e escuro), fonte do Google Fonts, favicon e título; home montada pela ordem do tema; textos e contatos fixos da piloto removidos (nome, logo, rodapé, login, cadastro, contato)
- [x] 7.4 Painel → **Aparência**, com pré-visualização das cores e reordenação das seções
- [x] 7.5 Painel da plataforma em `/plataforma` (papel `devAdmin` faz o papel de super admin): cria igreja + domínios + primeiro admin e envia convite por e-mail; `POST /churches` deixou de ser público
- [x] 7.6 Painel → Usuários → **Importar planilha** (CSV com `,` ou `;`, modelo para baixar, conferência antes de importar, relatório por linha)
- [x] 7.7 Guia de implantação e domínios na Hostinger: `GUIA_Implantacao_Igreja.md`
- [x] 7.8 Uso por igreja (membros, armazenamento, IA e ofertas em 30 dias, Mercado Pago) e limite de armazenamento por igreja (padrão 2 GB, 413 ao passar)
- [x] 7.9 Decisão P3: **app único** com escolha da igreja (o app já funcionava assim; nada a publicar por igreja)
- [x] 7.10 Ensaio cronometrado no navegador: criar igreja → aceite de termos e contrato → aparência → importar 3 membros → chave PIX levou **~5 s de automação**; o tempo real fica por conta de coletar os dados e do DNS. O mesmo build mostrou duas igrejas diferentes em dois endereços

**Validação:** suíte da API: 504 testes (14 novos). Site: typecheck, lint (sem problemas novos) e build ok; ensaio ponta a ponta no navegador.

**Bugs encontrados pelo ensaio:** (1) o topo da home de qualquer igreja mostrava a **foto e a logo da Princípios de Vida** (imagens fixas no código) — agora a foto vem da Aparência (sem foto: degradê na cor da igreja) e, sem logo, aparecem as iniciais; a piloto continua com as imagens de sempre; (2) a página da plataforma não abria num domínio sem igreja cadastrada.

## Sprint 8 — Planos comerciais e cobrança

- [x] 8.1 Decisão P1: **Asaas** (recorrência por boleto e PIX; as assinaturas do Mercado Pago no Brasil são basicamente por cartão). Fica isolado em `src/helpers/asaas.helper.ts`
- [x] 8.2 Assinatura em `Church.subscription` (plano, status, teste, período pago, carência, ids do Asaas) + `BillingInvoice` (faturas) + `BillingWebhookEvent` (deduplicação). Igreja nova: 30 dias de teste no plano escolhido. Igrejas anteriores (piloto): Completo e isentas, sem mudança
- [x] 8.3 Plano → recursos: IA, anúncios e rádio só no Completo; PIX com confirmação automática (Mercado Pago) só no Completo; o Essencial mantém o PIX pela chave da igreja. Ligar recurso fora do plano → 402 `PLAN_UPGRADE_REQUIRED`
- [x] 8.4 `POST /billing/subscribe` (cliente com o CNPJ do contrato aceito, assinatura mensal com 1º vencimento no fim do teste), troca de plano e cancelamento; webhook `POST /billing/asaas/webhook` com token, deduplicação por evento e **consulta do pagamento na API** antes de mudar o status
- [x] 8.5 Carência de 15 dias após o vencimento; depois, **somente leitura**: qualquer alteração responde 402 `SUBSCRIPTION_READ_ONLY` (exceto cobrança, login, termos e direitos do titular); nenhum dado é apagado. Avisos por e-mail aos admins (teste acabando, em aberto, somente leitura, cancelada), um por mudança de estado
- [x] 8.6 Painel → **Meu plano** (plano, situação, planos lado a lado, assinar/trocar/cancelar, faturas com link de pagamento) + faixa de aviso no topo do painel; `/plataforma` mostra plano/situação e permite trocar plano, isentar, reiniciar teste
- [x] 8.7 Taxa de implantação: botão "Cobrar implantação" em `/plataforma` (cobrança única no Asaas, aparece nas faturas da igreja)

**Validação:** suíte da API: 523 testes (19 novos). Site: build ok e fluxo no navegador contra um Asaas simulado: teste → assinar Essencial → pagamento confirmado → "Ativa" → atraso além da carência → faixa vermelha e escrita recusada (402), com "Meu plano" e "Pagar" ainda acessíveis.

**A confirmar com o Asaas real:** a URL de produção (a documentação consultada só mostrava o sandbox) e se existe um campo para trocar o valor da assinatura — como não está documentado, a troca de plano encerra a assinatura antiga e cria outra no mesmo vencimento.

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
| 23/11/2026 | 4 | O `state` do OAuth é um valor aleatório guardado no banco (uso único, 10 min), e não um valor assinado: assim também guardamos o code_verifier do PKCE no servidor, como recomenda a documentação ("state sem dados sensíveis"). |
| 23/11/2026 | 4 | O Mercado Pago não documenta endpoint de revogação. "Desconectar" apaga os tokens do nosso lado; o painel orienta o admin a remover a aplicação também na conta dele. |
| 23/11/2026 | 4 | Conectar a conta **ainda não ativa** a cobrança on-line: os membros seguem vendo a chave PIX até a Sprint 5. |
| 23/11/2026 | 5 | A notificação do Mercado Pago **nunca é prova de pagamento**: o status só muda depois de consultar o pagamento na API com o token da igreja e conferir a referência (id da oferta) e o valor. A assinatura é uma camada extra. |
| 23/11/2026 | 5 | PIX vale 60 minutos (o Mercado Pago aceita de 30 min a 30 dias). Ofertas pendentes aparecem no histórico; as que vencem viram "Expirado". |
| 23/11/2026 | 5 | O pagador precisa ter e-mail no cadastro (exigência do Mercado Pago); sem e-mail, a API pede para cadastrar. |
| 23/11/2026 | 6 | "No ar" = flag ligada **e** termo aceito na versão vigente. Isso cumpre URS-RAD-03 mesmo para a igreja-piloto, que tinha a flag ligada provisoriamente. |
| 23/11/2026 | 6 | Os arquivos de áudio continuam acessíveis pela URL direta de upload mesmo com a rádio desligada (o player some, mas o link do arquivo não é bloqueado). Avaliar se vale proteger `/uploads` por igreja. |
| 24/11/2026 | 8 | **P1 decidido: Asaas** para as mensalidades. O Mercado Pago segue só para as ofertas dos membros, na conta de cada igreja. |
| 24/11/2026 | 8 | A assinatura fica dentro da igreja (`Church.subscription`), não num model separado: o estado é calculado na hora (teste, carência, somente leitura) sem depender de rotina agendada. |
| 24/11/2026 | 8 | Igrejas sem plano gravado (anteriores à cobrança) = Completo e isentas. A piloto não precisa de migração. |
| 24/11/2026 | 8 | Somente leitura bloqueia alterações na API; o app mostra a mensagem de erro da API, mas ainda não tem uma faixa própria de aviso (avaliar se algum cliente sentir falta). |
| 24/11/2026 | 7 | **P3 decidido: app único** com escolha da igreja (já era o comportamento do app). Branding por igreja no app fica fora do escopo até algum cliente pedir. |
| 24/11/2026 | 7 | Um único site para todas as igrejas, com a igreja descoberta pelo domínio; `NEXT_PUBLIC_CHURCH_SLUG` continua disponível para quem quiser um site dedicado. |
| 24/11/2026 | 7 | O papel `devAdmin` já existente é o "super admin" da plataforma (não foi criado um papel novo). |
| 24/11/2026 | 7 | Membros importados entram ativos e sem senha; criam a senha por "Esqueci minha senha". O admin novo recebe um e-mail explicando isso. |
| 23/11/2026 | 0 | Migrações ficam em `src/migrations/` porque `**/scripts/` está no `.gitignore`. |
| 23/11/2026 | 0 | O app não define `trust proxy`; por isso o aceite grava `ip` e também o cabeçalho `X-Forwarded-For` bruto. Revisar se o proxy da Hostinger exige `app.set("trust proxy", ...)`. |

## Decisões pendentes

| # | Pendência | Prazo | Situação |
|---|---|---|---|
| P1 | Mercado Pago Assinaturas ou Asaas para mensalidades | Antes da Sprint 8 | **Decidida (24/11): Asaas** |
| P2 | Advogado para a revisão | Sprint 1 | Aberta |
| P3 | App único ou app com a marca de cada igreja | Antes da Sprint 7 | **Decidida (24/11): app único** |
| P4 | Preços finais | Antes do primeiro cliente | Aberta (hipótese: R$ 300–500 + R$ 97/R$ 197) |
| P5 | Escopo da tesouraria | Após a Sprint 8 | Aberta |

## Histórico de sprints

| Data | Sprint | Entregue | Pendente / observações |
|---|---|---|---|
| 23/11/2026 | — | URS, plano e este documento de status criados. | Nenhuma sprint iniciada. |
| 24/11/2026 | 8 | Planos Essencial (R$ 97) e Completo (R$ 197) com teste de 30 dias, cobrança recorrente no Asaas (boleto/PIX), webhook seguro, carência e somente leitura, avisos por e-mail, "Meu plano", taxa de implantação e controles na plataforma. | **Antes do deploy:** (1) criar conta no Asaas (Athos), gerar a chave da API e definir `ASAAS_API_KEY` e `ASAAS_API_URL` de **produção**; (2) cadastrar o webhook no Asaas apontando para `https://<api>/athos_adm/api/billing/asaas/webhook`, eventos de cobrança, com um token em `ASAAS_WEBHOOK_TOKEN`; (3) sem Redis, criar cron diário para `/internal/cron/billing-notices`; (4) testar primeiro no sandbox. A igreja-piloto continua isenta (não tem plano gravado). |
| 24/11/2026 | 7 | Site multi-igreja por domínio, tema por igreja, painel da plataforma (criar igreja + admin + convite), importação de membros por CSV, uso e limite de armazenamento, guia de implantação. | **Antes do deploy:** (1) no site da piloto, nada muda se `NEXT_PUBLIC_CHURCH_SLUG` estiver definido; se não estiver, cadastrar o domínio da piloto em `/plataforma` (até lá ela é a igreja padrão); (2) conferir que a piloto tem a logo cadastrada em Geral — o site passa a usar a logo do cadastro quando ela é uma URL válida; (3) incluir os domínios das igrejas novas em `CORS_ORIGINS` da API. |
| 23/11/2026 | 6 | Rádio desligada por padrão, ativação só com aceite do termo de responsabilidade (ECAD) registrado, desativação, nova versão do termo tira do ar até novo aceite, revogação desliga. | **Atenção no deploy:** a rádio da igreja-piloto **sai do ar** até um admin aceitar o termo em Painel → Rádio (a ativação provisória da Sprint 0 não basta mais). Rodar `npm run legal:publish` antes (publica o termo) e avisar o admin para aceitar logo em seguida. |
| 23/11/2026 | 5 | PIX real na conta da igreja via Mercado Pago, webhook seguro (consulta na API, assinatura, idempotência), confirmação automática de inscrições, conciliação e expiração, telas com confirmação automática (site e app). | **Antes do deploy:** cadastrar no painel do Mercado Pago (Webhooks da aplicação) a URL `https://<api>/athos_adm/api/payments/mercadopago/webhook`, evento "Pagamentos", e copiar a chave secreta para `MP_WEBHOOK_SECRET`; sem Redis, criar cron a cada 10–15 min chamando `/internal/cron/mercadopago-reconcile`. Fazer o teste real (5.11) com valor baixo antes de divulgar. |
| 23/11/2026 | 4 | Conexão OAuth da conta Mercado Pago da igreja (PKCE, state de uso único, tokens criptografados), renovação diária, status e desconexão; card no painel. | **Antes do deploy:** (1) criar a aplicação no Mercado Pago (conta da Athos), cadastrar a URL de redirecionamento `https://<api>/athos_adm/api/payments/mercadopago/callback` e ativar PKCE; (2) definir `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI`, `ADMIN_PANEL_URL`, `TOKEN_ENCRYPTION_KEY` (guardar cópia segura) e `CRON_SECRET`; (3) sem Redis, criar cron diário na Hostinger chamando a rota interna. Sem essas variáveis o card mostra "em preparação" e nada quebra. |
| 23/11/2026 | 3 | Chave PIX da igreja com BR Code/QR reais, painel "Ofertas (PIX)", telas de oferta no site e no app, inscrição paga com PIX e confirmação manual, fim das cobranças simuladas em produção, webhook protegido, Stripe removido. | **Antes do deploy:** cadastrar a chave PIX da igreja-piloto no painel (Ofertas (PIX)); **não** definir `PAYMENTS_MOCK_ENABLED` em produção; deixar `PAYMENT_WEBHOOK_SECRET` vazio (webhook desligado) até a Sprint 5. Inscrições pagas passam a ficar "registradas" até a secretaria confirmar (mudar para "confirmada" no painel de eventos). Publicar nova versão do app para corrigir as inscrições. |
| 23/11/2026 | 2 | Consentimento específico para ficha médica (próprio e de menores), bloqueio e ocultação sem consentimento, revogação que apaga os dados, aceite no cadastro, exportação de dados, exclusão incluindo filhos. Novo texto `sensitive_data_consent.md`. | **Antes do deploy:** rodar `npm run legal:publish` (agora também publica o termo de dados sensíveis). **Atenção:** após o deploy, as fichas médicas já cadastradas ficam ocultas até cada titular (ou responsável) consentir — avise a igreja-piloto. Os dados continuam no banco; decidir se serão apagados após um prazo sem consentimento (ver decisões). |
| 23/11/2026 | 1 | Minutas de Termos, Política, Contrato e DPA; publicação a partir de arquivos (`legal:publish`, idempotente, `--minor`); placeholders do fornecedor por variável de ambiente; exportação de evidências; páginas públicas, modal de aceite (site e app), bloqueio do painel até o aceite do contrato, página "Documentos legais". | **Antes do deploy:** definir `LEGAL_PROVIDER_NAME`, `LEGAL_PROVIDER_DOCUMENT`, `LEGAL_PROVIDER_EMAIL` e `LEGAL_FORUM_CITY` (senão os textos mostram `[RAZÃO SOCIAL DO FORNECEDOR]` etc.), cadastrar o e-mail de contato da igreja no painel, e rodar `npm run legal:publish` com `APP_ENV=production`. A partir daí **todos os usuários** verão o modal de aceite no próximo acesso e o **admin da igreja-piloto** ficará bloqueado no painel até aceitar o contrato. Recomendo publicar só depois da revisão do advogado (1.10), ou publicar já e publicar a v2 revisada depois (exigirá novo aceite). |
| 23/11/2026 | 0 | Documentos legais versionados e imutáveis, registro de aceites/revogações com evidência (IP, X-Forwarded-For, user-agent, hash do texto exibido), pendências por usuário/igreja, feature flags por igreja, migração da igreja-piloto, 31 testes novos (suíte: 395 passando). | **Antes do deploy:** rodar `npm run migrate:pilot-radio -- <slug-da-piloto>` com `APP_ENV=production` (usa `tsx`, que é dependência de desenvolvimento). Nenhum documento está publicado ainda: `/legal/pending` retorna vazio até a Sprint 1. Site e app ainda não consomem as rotas novas. |

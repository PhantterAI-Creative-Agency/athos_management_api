# URS — Athos Management: Prontidão Comercial

**Documento:** Especificação de Requisitos do Usuário (User Requirements Specification)
**Versão:** 1.0
**Data:** 23/11/2026
**Plano de implementação:** [`PLANO_Comercializacao.md`](./PLANO_Comercializacao.md)
**Acompanhamento:** [`Status_Plano_Comercializacao.md`](./Status_Plano_Comercializacao.md)

---

## 1. Objetivo

Deixar o Athos Management pronto para ser vendido a igrejas além da igreja-piloto (Princípios de Vida). O foco é corrigir o que impede a venda (pagamentos simulados, ausência de base jurídica/LGPD, custo de implantação) e não criar funcionalidades novas sem demanda de cliente pagante.

## 2. Escopo

| Dentro do escopo | Fora do escopo (por enquanto) |
|---|---|
| Ofertas por PIX reais via Mercado Pago | Outros provedores de pagamento (Stripe, Pagar.me, Asaas para ofertas) |
| Contrato SaaS, DPA, Termos e Política de Privacidade | Assinatura com certificado digital (Autentique, ClickSign) |
| Registro auditável de aceites e consentimentos | Comissão sobre ofertas |
| Rádio como recurso opcional com aceite de responsabilidade | Rádio na oferta principal |
| Personalização por igreja (tema) e onboarding pelo painel | Fork de repositório por cliente |
| Cobrança da mensalidade das igrejas | Tesouraria (prevista, requisitos a levantar — §10) |

## 3. Partes interessadas e papéis

| Papel | Descrição |
|---|---|
| **Fornecedor (Athos)** | Operador dos dados (LGPD). Cobra implantação e mensalidade. |
| **Igreja cliente** | Controladora dos dados dos seus membros. |
| **Representante legal da igreja** | Pessoa que assina o contrato em nome da igreja (normalmente o pastor presidente, conforme estatuto e CNPJ). |
| **Administrador da igreja** | Usuário com papel administrativo no painel. Não é, necessariamente, o representante legal. |
| **Membro / visitante** | Titular dos dados. Usa site e app. |
| **Responsável legal de menor** | Pai, mãe ou responsável que cadastra ou gerencia dados de filhos. |

## 4. Decisões tomadas

| # | Tema | Decisão |
|---|---|---|
| D1 | Provedor de pagamento | **Somente Mercado Pago.** Abstração para outros provedores só quando um cliente pedir. |
| D2 | Conta de recebimento | Cada igreja conecta **a própria conta Mercado Pago via OAuth**. O dinheiro cai direto na conta da igreja e nunca passa pelo Athos. |
| D3 | Comissão | **Não há comissão sobre ofertas.** A receita do Athos vem da implantação e da mensalidade. |
| D4 | Cobrança das mensalidades | Feita por **conta separada, do próprio Athos** no **Mercado Pago da PhantterAI**, por PIX (fatura mensal) ou cartão (Mercado Pago Assinaturas) — P1 decidida em 24/11. |
| D5 | Solução provisória de PIX | Até a integração ficar pronta, exibir a **chave PIX estática da igreja**, com botão de copiar, sem confirmação automática. O fluxo simulado sai do ar. |
| D6 | Contrato | **Aceite eletrônico** pelo **representante legal** da igreja, com registro de evidências. Inclui DPA (igreja controladora, Athos operador). |
| D7 | Revisão jurídica | Minuta preparada internamente e **revisada uma única vez por advogado** de tecnologia/LGPD. O mesmo modelo serve para todas as igrejas. |
| D8 | Consentimento dos membros | **Checkbox específico e separado** para dados sensíveis (ficha médica, dados de filhos), além do aceite dos Termos. |
| D9 | Rádio | **Fora da oferta principal.** Desativada por padrão; ativação exige modal sobre direitos autorais/ECAD e aceite registrado do administrador. |
| D10 | Customização | **Código único** com temas configuráveis por `churchId`, guardados no banco. Sem fork por cliente. |
| D11 | Preços (hipótese a validar) | Implantação R$ 300–500 (única). **Essencial** ~R$ 97/mês. **Completo** ~R$ 197/mês. |
| D12 | Tesouraria | Será criada como ministério/departamento. **Fica para depois** dos itens acima. |

## 5. Situação atual (levantada no código em 23/11/2026)

| Área | Situação | Onde |
|---|---|---|
| Pagamentos | Stub: gera IDs `*_mock_*`, QR Code e copia-e-cola falsos. Provedor padrão é `stripe`. Enum aceita `stripe`, `pagarme`, `mercadopago`. | `src/helpers/paymentProvider.helper.ts`, `src/models/Offering.model.ts`, `src/interfaces/offering.interface.ts` |
| Webhook | Público e **sem validação de assinatura**: qualquer pessoa consegue marcar uma oferta como paga. | `src/routes/payments.routes.ts`, `src/jobs/paymentWebhook.job.ts` |
| Fila | BullMQ já existe para o webhook, com fallback inline sem Redis. | `src/jobs/paymentWebhook.job.ts` |
| Termos de Serviço | Existem (site e app), mas com o nome **"Princípios de Vida" fixo no texto**, sem versionamento e sem registro de aceite. | `athos_management_mobile/src/constants/terms.ts`, site `app/(app)/termos-de-servico` |
| Política de Privacidade | **Não existe página.** Os Termos apenas a mencionam. | — |
| Exclusão de dados | Existe solicitação de exclusão de dados. | `DataDeletionRequest.model.ts`, site `exclusao-de-dados` |
| Dados sensíveis | Ficha médica (`medicalRecord`) e vínculo com filhos (`childrenIds`) sem consentimento específico registrado. | `src/models/User.model.ts` |
| Personalização | `Church.settings` tem apenas `primaryColor`, nome de GC, YouTube e anúncios. Sem flag de rádio. | `src/models/Church.model.ts` |
| Auditoria | `AuditLog` existe e pode ser reaproveitado. | `src/helpers/auditLogger.helper.ts` |
| Mensalidades / planos comerciais | Não existe. | — |

## 6. Requisitos de usuário

Prioridade: **M** = obrigatório antes do primeiro cliente pagante; **S** = desejável no lançamento; **C** = pode vir depois.

### 6.1 Pagamentos — PIX provisório

| ID | Requisito | Prio |
|---|---|---|
| URS-PAG-01 | O administrador deve poder cadastrar a chave PIX da igreja (tipo, chave, nome do favorecido) no painel. | M |
| URS-PAG-02 | O membro deve ver, na tela de ofertas (site e app), a chave PIX da igreja com botão "copiar" e, opcionalmente, QR Code estático. | M |
| URS-PAG-03 | O fluxo simulado (IDs `mock`, QR falso) não deve estar acessível em produção. | M |
| URS-PAG-04 | A tela deve informar que a confirmação não é automática enquanto a integração não estiver ativa. | S |

### 6.2 Pagamentos — Mercado Pago

| ID | Requisito | Prio |
|---|---|---|
| URS-MP-01 | O administrador deve poder clicar em "Conectar Mercado Pago" e autorizar a conta da igreja via OAuth. | M |
| URS-MP-02 | Os tokens da igreja (access/refresh) devem ser guardados **criptografados** e renovados automaticamente antes de expirar. | M |
| URS-MP-03 | O administrador deve ver o status da conexão (conectado, conta, data) e poder desconectar. | M |
| URS-MP-04 | O membro deve poder gerar um PIX (QR Code e copia-e-cola) de valor definido, criado **com o token da igreja**, para dízimo, oferta e inscrição em evento pago. | M |
| URS-MP-05 | A confirmação de pagamento deve vir por webhook com **validação da assinatura** (`x-signature`) e consulta do pagamento na API do Mercado Pago antes de mudar o status. | M |
| URS-MP-06 | O processamento do webhook deve ser **idempotente** (mesmo evento recebido duas vezes não duplica efeitos). | M |
| URS-MP-07 | O sistema não deve cobrar nenhuma taxa sobre a oferta (sem `marketplace_fee`/`application_fee`). | M |
| URS-MP-08 | PIX não pago deve expirar e mudar para status `expired`/`failed`. | S |
| URS-MP-09 | Deve existir uma rotina de reconciliação que consulte pagamentos pendentes no Mercado Pago, para cobrir webhooks perdidos. | S |
| URS-MP-10 | Sem conta conectada, o sistema deve cair automaticamente na chave PIX estática (6.1). | M |
| URS-MP-11 | Reembolsos são feitos pela igreja no painel do Mercado Pago; o sistema deve refletir o status `refunded` recebido por webhook. | C |

### 6.3 Contrato, Termos e Política de Privacidade

| ID | Requisito | Prio |
|---|---|---|
| URS-LEG-01 | Termos de Uso, Política de Privacidade, Contrato SaaS e DPA devem ser **documentos versionados**, com texto integral guardado por versão. | M |
| URS-LEG-02 | Os textos devem ser **genéricos** e preencher o nome da igreja dinamicamente (sem "Princípios de Vida" fixo). | M |
| URS-LEG-03 | Deve existir página pública de Política de Privacidade no site e no app. | M |
| URS-LEG-04 | A Política de Privacidade deve tratar explicitamente de dados sensíveis (convicção religiosa, saúde), dados de crianças e adolescentes, compartilhamento com operadores (Mercado Pago, OpenRouter/IA, Hostinger, e-mail, push), retenção e direitos do titular. | M |
| URS-LEG-05 | O contrato deve ser aceito pelo **representante legal** da igreja, informando nome, CPF, cargo e CNPJ da igreja. | M |
| URS-LEG-06 | Cada aceite deve registrar: usuário, igreja, documento, versão, hash do texto, data/hora, IP e user-agent. O registro não pode ser editado nem apagado pela igreja. | M |
| URS-LEG-07 | Quando um documento ganhar nova versão, os usuários afetados devem ser solicitados a aceitar de novo no próximo acesso. | M |
| URS-LEG-08 | O fornecedor deve conseguir exportar a evidência de aceite de uma igreja (PDF ou JSON). | S |
| URS-LEG-09 | Os textos devem passar por **revisão de advogado** antes do primeiro cliente pagante. | M |

### 6.4 Consentimento dos membros (LGPD)

| ID | Requisito | Prio |
|---|---|---|
| URS-LGPD-01 | O cadastro (site e app) deve ter aceite dos Termos e da Política **separado** do consentimento para dados sensíveis. | M |
| URS-LGPD-02 | Ficha médica só pode ser preenchida após consentimento específico; sem ele, os campos ficam bloqueados. | M |
| URS-LGPD-03 | Dados de filhos menores só podem ser cadastrados por um responsável, com consentimento específico registrado em nome do menor. | M |
| URS-LGPD-04 | O titular deve poder revogar o consentimento; a revogação apaga ou anonimiza os dados sensíveis correspondentes. | M |
| URS-LGPD-05 | Usuários já cadastrados devem ser solicitados a dar o consentimento no próximo acesso; até lá, dados sensíveis existentes ficam ocultos. | M |
| URS-LGPD-06 | O titular deve poder baixar seus dados (portabilidade/acesso). | S |
| URS-LGPD-07 | A solicitação de exclusão de dados já existente deve cobrir também dados sensíveis e de filhos. | M |

### 6.5 Rádio

| ID | Requisito | Prio |
|---|---|---|
| URS-RAD-01 | A rádio deve vir **desativada** por padrão em toda igreja nova. | M |
| URS-RAD-02 | Ao ativar, o administrador deve ver um modal explicando, de forma direta, que tocar músicas de terceiros em transmissão pública exige licenciamento e pagamento ao ECAD, e que a responsabilidade é da igreja. | M |
| URS-RAD-03 | A ativação só ocorre após aceite expresso, registrado como em URS-LEG-06. | M |
| URS-RAD-04 | O contrato deve ter cláusula atribuindo à igreja a responsabilidade pelo conteúdo da rádio. | M |
| URS-RAD-05 | A igreja-piloto (Princípios de Vida) mantém a rádio, após o aceite do seu administrador. | M |
| URS-RAD-06 | Com a rádio desativada, rotas, menus e telas da rádio ficam ocultos e a API responde 403/404. | M |

### 6.6 Customização e implantação de igrejas

| ID | Requisito | Prio |
|---|---|---|
| URS-TEN-01 | Um único código (API, site, app) deve atender todas as igrejas, separadas por `churchId`/`slug`. | M |
| URS-TEN-02 | O administrador deve configurar no painel: logo, favicon, cores primária/secundária, fonte (lista fechada), ordem e visibilidade das seções da home. | S |
| URS-TEN-03 | O site deve resolver a igreja pelo domínio ou subdomínio, sem deploy novo por igreja. | M |
| URS-TEN-04 | O fornecedor deve criar uma igreja nova por um fluxo de onboarding (super-admin), incluindo o primeiro administrador. | M |
| URS-TEN-05 | Deve existir importação de membros por planilha (CSV). | S |
| URS-TEN-06 | Deve existir controle de recursos por igreja (feature flags): rádio, anúncios, assistente de IA, ofertas. | M |
| URS-TEN-07 | Deve ser possível medir o custo por igreja: armazenamento de uploads, chamadas de IA, volume de dados. | S |
| URS-TEN-08 | Deve existir limite de armazenamento por igreja para uploads (áudios da rádio). | S |
| URS-TEN-09 | O app deve ter um caminho definido para várias igrejas: app único com seleção de igreja, ou build com a marca de cada igreja (ver P3). | S |

### 6.7 Planos comerciais e cobrança das igrejas

| ID | Requisito | Prio |
|---|---|---|
| URS-COB-01 | Cada igreja deve ter um plano (`essencial`, `completo`) e um status de assinatura (`trial`, `ativa`, `inadimplente`, `cancelada`). | M |
| URS-COB-02 | Os recursos do plano Completo (IA, anúncios, rádio, PIX integrado) só ficam disponíveis para igrejas nesse plano. | M |
| URS-COB-03 | A mensalidade é cobrada na conta do Athos (D4), com PIX ou cartão de crédito (assinatura), e a confirmação atualiza o status da assinatura. | S |
| URS-COB-04 | Igreja inadimplente recebe aviso e, após prazo de carência, fica em modo somente leitura (nunca perde dados sem aviso). | S |
| URS-COB-05 | A taxa de implantação é registrada como cobrança única. | C |

## 7. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Tokens de terceiros criptografados em repouso (AES-256-GCM, chave em variável de ambiente). |
| RNF-02 | Nenhum log deve conter tokens, chave de assinatura de webhook ou dados sensíveis em texto claro. |
| RNF-03 | Hospedagem na **Hostinger**; nenhuma solução depende da Vercel (ver `CLAUDE.md`). Uploads continuam em disco, em `UPLOAD_DIR`. |
| RNF-04 | Cada nova rota deve ter teste de integração (Vitest + Supertest), seguindo o padrão do repositório. |
| RNF-05 | Isolamento entre igrejas: nenhuma consulta pode retornar dados de outra `churchId`. |
| RNF-06 | Webhooks respondem em menos de 2 s; o processamento pesado vai para a fila BullMQ. |

## 8. Pendências de decisão

| # | Pendência | Quando decidir |
|---|---|---|
| P1 | ~~Provedor das mensalidades.~~ **Decidida (24/11): Mercado Pago, PIX e Assinaturas no cartão.** | Antes da Sprint 8 |
| P2 | Escritório/advogado que fará a revisão (orçamento estimado: R$ 1.500–3.000). | Durante a Sprint 1 |
| P3 | App: app único com seleção de igreja ou build com a marca de cada igreja (custo de publicação nas lojas). | Antes da Sprint 7 |
| P4 | Valores finais de implantação e mensalidade, após conversa com pastores e pesquisa de concorrentes. | Antes do primeiro cliente |
| P5 | Escopo da tesouraria, a levantar com o pastor da igreja-piloto. | Após a Sprint 8 |

## 9. Atividades não técnicas (pré-requisitos de venda)

| ID | Atividade |
|---|---|
| NT-01 | Conversar com o pastor da igreja-piloto: o que mais usa, do que sente falta (tesouraria?). |
| NT-02 | Gravar depoimento curto em vídeo com o pastor. |
| NT-03 | Pedir 3 a 4 indicações de outros pastores. |
| NT-04 | Contratar a revisão jurídica (P2). |
| NT-05 | Preparar roteiro de demonstração de 15 minutos e a mensagem de indicação. |

## 10. Requisitos futuros — Tesouraria (a detalhar)

Registrado para não se perder. Os requisitos serão detalhados com a igreja-piloto (P5).

- Lançamento de entradas e saídas, com categorias.
- Integração com as ofertas confirmadas pelo Mercado Pago (entrada automática).
- Relatório mensal e prestação de contas para a igreja.
- Permissão específica (tesoureiro) no RBAC.

## 11. Critérios de aceite do conjunto

O Athos está pronto para o primeiro cliente pagante quando:

1. Nenhum fluxo simulado de pagamento está acessível em produção.
2. Uma igreja de teste conecta a própria conta Mercado Pago, recebe um PIX real e o status muda para pago por webhook validado.
3. Termos, Política de Privacidade, Contrato e DPA estão publicados, versionados e revisados por advogado.
4. O aceite do representante legal e os consentimentos dos membros ficam registrados com evidências.
5. A rádio só funciona após o aceite registrado.
6. Uma igreja nova entra no ar pelo painel, sem deploy manual.

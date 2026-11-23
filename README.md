# Athos Management — API

API do **Athos Management**: plataforma de gestão eclesiástica multi-igreja + módulo de leitura bíblica/devocional. Backend responsável por **todas** as regras de negócio e acesso a dados — os clients ([site/admin em Next.js](https://github.com/rodrigozan/igrejaprincipiosdevida) e [app Mobile em Expo](https://github.com/PhantterAI-Creative-Agency/athos_management_mobile)) são consumidores puros do contrato REST exposto aqui.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js + TypeScript (strict) |
| Framework HTTP | Express 5 |
| Banco de dados | MongoDB + Mongoose 9 |
| Validação | Zod (middleware `validate`) |
| Auth | JWT próprio (access + refresh rotativo), bcrypt |
| Filas/jobs | BullMQ + Redis (ioredis) |
| Logging | pino + pino-http |
| Segurança | helmet, cors, express-rate-limit (+ rate-limit-redis) |
| Pagamentos | Stub de provedor (Stripe / Mercado Pago / Pagar.me) — ver [Pagamentos](#pagamentos) |
| Push | Expo Server SDK + Firebase Admin |
| E-mail | Nodemailer (Gmail SMTP) |
| Storage | Disco do servidor (`UPLOAD_DIR`), servido em `/athos_adm/api/uploads` |
| IA | OpenRouter (assistente virtual "Mateus") |
| Bíblia | A Bíblia Digital API |
| YouTube | Feed RSS público do canal da igreja |
| Testes | Vitest + Supertest + mongodb-memory-server |

## Estrutura de pastas

Organização **por camada** (não por feature). Cada entidade de domínio tem um arquivo por camada — ex.: `ministry.interface.ts`, `Ministry.model.ts`, `ministries.service.ts`, `ministries.controller.ts`, `ministries.routes.ts`.

```
src/
├── server.ts              # bootstrap: conecta ao Mongo e sobe o HTTP
├── app.ts                 # Express: middlewares globais, /health, /uploads e montagem das rotas
├── config/                # env (validado com Zod), mongoose, cors
├── controllers/           # recebem a request, delegam ao service, respondem
├── services/              # TODA a regra de negócio vive aqui
├── models/                # schemas Mongoose
├── interfaces/            # tipos TypeScript + schemas Zod de domínio
├── routes/                # definição de rotas + middlewares por rota (+ testes de integração)
├── middlewares/           # authenticate, validate, rbac, rateLimiter, trackAccess, errorHandler, requestContext
├── helpers/               # jwt, password, response, qrToken, paymentProvider, openrouter, upload, auditLogger...
├── jobs/                  # workers BullMQ (push, e-mails, pagamentos, badges)
├── content/               # contexto em Markdown usado pelo assistente de IA
└── scripts/               # scripts pontuais (seed, fix de índice)
```

## Como rodar

### Pré-requisitos

- Node.js 20+
- Yarn
- MongoDB local ou remoto
- Redis (opcional — usado pelas filas BullMQ)

### Instalação

> ⚠️ Nunca rode instalação geral de dependências. Se precisar adicionar um pacote, instale **apenas ele** com `yarn add <pacote>`.

```bash
yarn
```

### Variáveis de ambiente

O arquivo carregado depende de `APP_ENV` (`local` → `.env.local`, `qa` → `.env.qa`, `production` → `.env.prod`). Use `.env.example` como base. Todas as variáveis são validadas com Zod em `src/config/env.ts` — a API não sobe se algo obrigatório faltar.

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `PORT` | não | `3333` | Porta HTTP |
| `MONGODB_URI` | **sim** | — | String de conexão Mongo |
| `JWT_ACCESS_SECRET` | **sim** | — | Secret do access token |
| `JWT_REFRESH_SECRET` | **sim** | — | Secret do refresh token |
| `JWT_ACCESS_EXPIRES_IN` | não | `15m` | Expiração do access token |
| `JWT_REFRESH_EXPIRES_IN` | não | `30d` | Expiração do refresh token |
| `CORS_ORIGINS` | não | `""` | Origens permitidas (separadas por vírgula) |
| `REDIS_URL` | não | — | Conexão Redis (filas BullMQ) |
| `BIBLE_API_BASE_URL` | não | `https://www.abibliadigital.com.br/api` | API de leitura bíblica |
| `BIBLE_API_TOKEN` | não | — | Token da API da Bíblia |
| `OPENROUTER_API_KEY` | não | — | Chat com IA (assistente) |
| `OPENROUTER_MODEL` | não | `deepseek/deepseek-chat` | Modelo usado via OpenRouter |
| `OPENROUTER_BASE_URL` | não | `https://openrouter.ai/api/v1` | Base URL do OpenRouter |
| `GMAIL_APP_NAME` / `GMAIL_APP_MAIL` / `GMAIL_APP_PASSWORD` | não | — | SMTP para envio de e-mail |
| `REGISTRATION_NOTIFY_EMAILS` | não | `""` | E-mails (separados por vírgula) avisados sobre novos cadastros |
| `UPLOAD_DIR` | não | `./uploads` | Pasta dos arquivos enviados (áudios da rádio). Na Hostinger, use um caminho **fora** da pasta do deploy |
| `RADIO_MAX_UPLOAD_MB` | não | `100` | Tamanho máximo de cada áudio enviado |

### Scripts

```bash
yarn dev          # desenvolvimento (APP_ENV=local, tsx + nodemon watch)
yarn dev:qa       # desenvolvimento apontando para .env.qa
yarn build        # compila TypeScript para dist/
yarn start        # produção (APP_ENV=production, node dist/server.js)
yarn start:qa     # produção em ambiente qa
yarn typecheck    # tsc --noEmit
yarn test         # vitest run (única execução)
yarn test:watch   # vitest em modo watch
```

## Contrato da API

### Prefixo

Todas as rotas ficam sob **`/athos_adm/api`**. Health check simples em `/health`. Arquivos enviados são servidos em `/athos_adm/api/uploads`.

```
GET http://localhost:3333/health
POST http://localhost:3333/athos_adm/api/auth/login
```

### Envelope de resposta

Sucesso e erro têm formatos fixos — Web e Mobile dependem exatamente deles:

```jsonc
// sucesso
{ "data": { /* ... */ } }

// erro
{ "error": { "code": "SOME_ERROR_CODE", "message": "Mensagem legível" } }
```

### Autenticação

JWT próprio com **access token curto** (15m) + **refresh token rotativo** (30d). O hash do refresh é persistido em `User.refreshTokenHash`.

- `POST /auth/register` — cadastro público (conta fica `pendingApproval` até um admin aprovar)
- `POST /auth/login` — login com e-mail/senha (rate limited)
- `POST /auth/refresh` — rotação do refresh token
- `POST /auth/forgot-password` / `POST /auth/reset-password` — redefinição de senha por e-mail
- `POST /auth/oauth/:provider` — login social
- `POST /auth/logout` — invalida o refresh token

Clients enviam `Authorization: Bearer <accessToken>` nas rotas protegidas (middleware `authenticate`).

### RBAC

Papéis são **flags independentes num array** (`User.roles`) — um usuário pode acumular vários (ex.: `pastor` + `volunteer`). Lista única definida em `src/helpers/jwt.helper.ts`:

```
visitor, member, volunteer, groupLeader, ministryLeader,
deacon, elder, pastor, seniorPastor, admin, devAdmin
```

Regras:

- `admin` tem privilégios totais **dentro da própria igreja** (`churchId`).
- `devAdmin` tem privilégios totais em **qualquer** igreja; só outro `devAdmin` pode conceder esse papel. Também é o único que gerencia planos de leitura, badges e a exclusão em massa de usuários inativos.
- Rotas administrativas usam `withRole([...])`; rotas "dono do recurso, família ou admin" usam `withSelfFamilyOrRole([...])` (pais e cônjuge gerenciam os dados dos filhos).
- Ter um cargo (diácono/presbítero/pastor) **não** implica liderança automática de ministério/GC — isso vem de `MinistryVolunteer.role` e `GrowthGroup.leaderId`. Líderes de ministério gerenciam as escalas do próprio ministério.

### Multi-tenancy

Todo documento e consulta relevante é escopado por **`churchId`**. Nenhuma query pode vazar dados entre igrejas — única exceção são operações de `devAdmin`.

## Funcionalidades (módulos)

Todos montados em `/athos_adm/api/...` (ver `src/routes/index.ts`):

### Igreja e pessoas

| Rota | Funcionalidades |
|---|---|
| `/auth` | Cadastro, login, refresh, recuperação de senha, OAuth, logout |
| `/users` | Criação de usuário, listagem/filtro, perfil completo (contato, dados profissionais, ficha médica, veículos), **família** (cônjuge e filhos), ativação/aprovação, exclusão de inativos (`devAdmin`) |
| `/churches` | Registro e busca de igreja por nome; dados da igreja: endereço (CEP), contato, redes sociais, horários de culto, **conteúdo da Home** (intro, missão, visão, valores, evento do banner), **widgets do rodapé** (até 12) e configurações (nome/sigla dos GCs, anúncios) |
| `/ministries` | CRUD de ministérios, voluntários e líder; **funções de serviço**; **escalas** (`/:id/schedules`) gerenciáveis por admin ou líder do ministério. Lista ordenada com os ministérios do usuário primeiro + flag `isVolunteer` |
| `/growth-groups` | Grupos de crescimento / Reunião nos Lares: CRUD, líder, adicionar/remover membros |
| `/pastoral-care` | Destinatários do acompanhamento pastoral (admin) e pedidos recebidos (liderança); pedidos geram push para os destinatários ativos |
| `/dashboard` | Resumo do admin: contadores (eventos futuros, ministérios, grupos, pedidos pastorais pendentes, membros ativos), acessos por dia e por ministério (via `trackAccess`) |

### Conteúdo

| Rota | Funcionalidades |
|---|---|
| `/events` + inscrições | CRUD de eventos (título, data, local, preço, banners, `registrationUrl`), inscrições e confirmação de pagamento da inscrição |
| `/devotionals` | CRUD de devocionais com data de publicação |
| `/media` | Fotos (cadastro manual) e vídeos sincronizados do **YouTube** da igreja (`POST /media/sync-youtube` e cron interno) |
| `/ads` | Anúncios por posição (slides/cards da Home, Eventos, Mídias, Devocionais, Ministérios), período de exibição, ordem, ativação, sorteio (`/random`), contagem de cliques e configurações (desligar tudo ou posições específicas) |
| `/radio` | Rádio da igreja: upload de **músicas e vinhetas** para o disco (`UPLOAD_DIR`), edição de título/artista, **playlists** ordenáveis com início/término programados |
| `/bible` | Leitura bíblica (proxy da A Bíblia Digital) |
| `/plans` | Planos de leitura bíblica e progresso do usuário |
| `/highlights` | Destaques de versículos + curtidas |
| `/badges` | Conquistas (critério por tipo e meta) e badges do usuário |

### Comunidade

| Rota | Funcionalidades |
|---|---|
| `/mural` | Posts (de usuário ou da igreja, visibilidade pública/privada, público-alvo) + curtidas |
| `/friends` | Convites de amizade, aceite, remoção |
| `/follows` | Seguir/deixar de seguir, listar seguidores e seguindo (gera notificação de novo seguidor) |
| `/notifications` | Listar, marcar como lida, marcar todas como lidas |
| `/checkin` | Check-in por QR Code (token assinado + registro, opcionalmente por evento) |
| `/ai-chat` | Assistente virtual "Mateus" (OpenRouter). Classifica a intenção: dúvidas sobre o sistema são respondidas com o contexto da igreja; pedidos de oração/aconselhamento são encaminhados ao acompanhamento pastoral |

### Financeiro

| Rota | Funcionalidades |
|---|---|
| `/offerings` | Ofertas (criação com checkout, PIX QR Code/copia-e-cola, listagem, resumo/total do usuário) |
| `/payments` | Webhook do provedor de pagamento |

### Público e interno

| Rota | Funcionalidades |
|---|---|
| `/public` | Endpoints sem login por slug da igreja: dados da igreja, eventos, devocionais, mídias, ministérios, **rádio** (playlists vigentes + `nextChangeAt`) e anúncios (com registro de clique) |
| `/contact` | Formulário de contato (público, rate limited, enviado por e-mail) |
| `/data-deletion-requests` | Solicitações de exclusão de dados (LGPD), com e-mail |
| `/internal` | `GET /internal/cron/media-youtube-sync` — sincroniza os vídeos do YouTube de todas as igrejas (rate limited) |

## Jobs (BullMQ)

Processamento assíncrono fora do ciclo request/response (requer `REDIS_URL`):

| Job | Função |
|---|---|
| `pushNotification.job` | Envio de push via Expo/Firebase |
| `paymentWebhook.job` | Processamento de webhooks de pagamento |
| `badgeCalculation.job` | Recálculo de badges/conquistas |
| `contactEmail.job` | E-mails do formulário de contato |
| `registrationEmail.job` | Aviso de novos cadastros para `REGISTRATION_NOTIFY_EMAILS` |
| `userAccountEmail.job` | E-mails de conta de usuário |
| `passwordResetEmail.job` | E-mail de redefinição de senha |
| `dataDeletionRequestEmail.job` | E-mail das solicitações de exclusão de dados |

## Pagamentos

`src/helpers/paymentProvider.helper.ts` ainda é um **stub**: gera identificadores e PIX simulados para manter o fluxo criação → checkout → webhook testável ponta a ponta. Substitua pela chamada real ao SDK do provedor quando houver credenciais.

## Testes

Convenções (TDD §13):

- **Vitest** para regras de negócio (ex.: particionamento de destaques de ministério, cálculo de progresso de plano).
- **Supertest + mongodb-memory-server** para contratos de rota — arquivos `*.integration.test.ts` colocados junto às rotas em `src/routes/`.

```bash
yarn test
```

## Deploy

- Hospedada na **Hostinger** como app Node.js (`yarn build` → `dist/server.js`, iniciado com `yarn start`). Não use soluções dependentes da Vercel.
- Arquivos enviados (áudios da rádio) ficam em `UPLOAD_DIR` no disco do servidor — mantenha essa pasta fora do diretório do deploy para não perdê-la a cada publicação.
- A sincronização periódica do YouTube depende de um agendamento chamando `GET /athos_adm/api/internal/cron/media-youtube-sync` (ex.: Cron Job da Hostinger a cada 6 horas).
- Ambientes controlados por `APP_ENV`: `local`, `qa`, `production` (arquivos `.env.local` / `.env.qa` / `.env.prod`).

## Princípios não-negociáveis

1. **Esta API é a única dona de regras de negócio e acesso a dados.** Se um client precisa de algo que não está exposto, cria-se endpoint — nunca workaround no client.
2. **Multi-tenant por `churchId`** em toda query relevante.
3. **Validação com Zod via middleware `validate`**, nunca inline nos controllers.
4. **Envelope de erro padrão** `{ "error": { "code", "message" } }` em todos os endpoints.
5. Mudanças de contrato consideram sempre os **dois clients** (Web e Mobile).

## Referências

- `TDD_api.md` (raiz do repo) — spec técnica completa (modelos, contratos de rota, auth, pagamentos, push, check-in, segurança, performance)
- `PRD.md` (raiz do repo) — escopo funcional do produto

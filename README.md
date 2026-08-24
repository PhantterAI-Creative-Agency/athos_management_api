# Athos Management — API

API do **Athos Management**: plataforma de gestão eclesiástica + módulo de leitura bíblica/devocional. Backend responsável por **todas** as regras de negócio e acesso a dados — os clients (Web em Next.js e Mobile em React Native) são consumidores puros do contrato REST exposto aqui.

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js + TypeScript (strict) |
| Framework HTTP | Express 5 |
| Banco de dados | MongoDB + Mongoose 9 |
| Validação | Zod (middleware `validate`) |
| Auth | JWT próprio (access + refresh rotativo) |
| Filas/jobs | BullMQ + Redis (ioredis) |
| Logging | pino + pino-http |
| Segurança | helmet, cors, express-rate-limit (+ rate-limit-redis) |
| Pagamentos | Stripe |
| Push | Expo Server SDK + Firebase Admin |
| E-mail | Nodemailer (Gmail SMTP) |
| Storage | AWS S3 (URLs pré-assinadas) |
| IA | OpenRouter (chat do assistente) |
| Bíblia | A Bíblia Digital API |
| Testes | Vitest + Supertest + mongodb-memory-server |

## Estrutura de pastas

Organização **por camada** (não por feature). Cada entidade de domínio tem um arquivo por camada — ex.: `ministry.interface.ts`, `Ministry.model.ts`, `ministries.service.ts`, `ministries.controller.ts`, `ministries.routes.ts`.

```
src/
├── server.ts              # bootstrap: conecta ao Mongo e sobe o HTTP
├── app.ts                 # Express: middlewares globais, /health e montagem das rotas
├── config/                # env (validado com Zod), mongoose, cors
├── controllers/           # recebem a request, delegam ao service, respondem
├── services/              # TODA a regra de negócio vive aqui
├── models/                # schemas Mongoose
├── interfaces/            # tipos TypeScript de domínio
├── routes/                # definição de rotas + middlewares por rota
├── middlewares/           # authenticate, validate, rbac, rateLimiter, errorHandler, requestContext
├── helpers/               # jwt, password, response, qrToken, paymentProvider, openrouter, auditLogger...
├── jobs/                  # workers BullMQ (push, paymentWebhook, badgeCalculation, contactEmail)
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
| `CRON_SECRET` | não | — | Protege endpoints de cron internos |

### Scripts

```bash
yarn dev          # desenvolvimento (APP_ENV=local, tsx + nodemon watch)
yarn dev:qa       # desenvolvimento apontando para .env.qa
yarn build        # compila TypeScript para dist/
yarn start        # produção (APP_ENV=production)
yarn start:qa     # produção em ambiente qa
yarn typecheck    # tsc --noEmit
yarn test         # vitest run (única execução)
yarn test:watch   # vitest em modo watch
```

## Contrato da API

### Prefixo

Todas as rotas ficam sob **`/athos_adm/api`**. Health check simples em `/health`.

```
GET http://localhost:3333/health
GET http://localhost:3333/athos_adm/api/auth/login
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

- `POST /auth/login` — login com e-mail/senha (rate limited)
- `POST /auth/refresh` — rotação do refresh token
- `POST /auth/oauth/:provider` — login social
- `POST /auth/logout` — invalida o refresh token

Clients enviam `Authorization: Bearer <accessToken>` nas rotas protegidas (middleware `authenticate`).

### RBAC

Papelões são **flags independentes num array** (`User.roles`) — um usuário pode acumular vários (ex.: `pastor` + `volunteer`). Lista única definida em `src/helpers/jwt.helper.ts`:

```
visitor, member, volunteer, groupLeader, ministryLeader,
deacon, elder, pastor, seniorPastor, admin, devAdmin
```

Regras:

- `admin` tem privilégios totais **dentro da própria igreja** (`churchId`).
- `devAdmin` tem privilégios totais em **qualquer** igreja; só outro `devAdmin` pode conceder esse papel.
- Rotas administrativas usam `withRole([...])`; rotas "dono do recurso ou admin" usam `withSelfOrRole([...])` / `withSelfFamilyOrRole([...])`.
- Ter um cargo (diácono/presbítero/pastor) **não** implica liderança automática de ministério/GC — isso vem de `MinistryVolunteer.role` e `GrowthGroup.leaderId`.

### Multi-tenancy

Todo documento e consulta relevante é escopado por **`churchId`**. Nenhuma query pode vazar dados entre igrejas — única exceção são operações de `devAdmin`.

## Módulos (rotas montadas)

Todos montados em `/athos_adm/api/...` (ver `src/routes/index.ts`):

| Rota | Domínio |
|---|---|
| `/auth` | Login, refresh, OAuth, logout |
| `/users` | Criação de usuário, perfil, família |
| `/churches` | Registro de igreja, busca, dados da igreja |
| `/events` + inscrições | Eventos e inscrições (com pagamento via Stripe quando aplicável) |
| `/ministries` | Ministérios e voluntários (lista já vem ordenada com ministérios do usuário primeiro + flag `isVolunteer`) |
| `/growth-groups` | Grupos de crescimento (GC), membros |
| `/offerings` | Ofertas |
| `/payments` | Webhook de pagamento (Stripe) |
| `/mural` | Posts do mural + curtidas |
| `/media` | Mídia (S3 presigned, sync YouTube) |
| `/devotionals` | Devocionais |
| `/friends` | Amizades |
| `/highlights` | Destaques de leitura + curtidas |
| `/plans` | Planos de leitura bíblica e progresso |
| `/bible` | Leitura bíblica (proxy A Bíblia Digital) |
| `/badges` | Conquistas/badges do usuário |
| `/checkin` | Check-in por QR Code (token + registro) |
| `/notifications` | Notificações (listar/marcar como lidas) |
| `/ai-chat` | Assistente com IA (OpenRouter) |
| `/pastoral-care` | Pedidos de cuidado pastoral |
| `/contact` | Formulário de contato (público, rate limited) |
| `/public` | Endpoints públicos por slug de igreja (eventos, devocionais, mídia, ministérios) |
| `/internal` | Endpoints de cron (protegidos por `CRON_SECRET`) |

## Jobs (BullMQ)

Processamento assíncrono fora do ciclo request/response (requer `REDIS_URL`):

| Job | Função |
|---|---|
| `pushNotification.job` | Envio de push via Expo/Firebase |
| `paymentWebhook.job` | Processamento de webhooks de pagamento |
| `badgeCalculation.job` | Recálculo de badges/conquistas |
| `contactEmail.job` | E-mails do formulário de contato |

## Testes

Convenções (TDD §13):

- **Vitest** para regras de negócio (ex.: particionamento de destaques de ministério, cálculo de progresso de plano).
- **Supertest + mongodb-memory-server** para contratos de rota — arquivos `*.integration.test.ts` colocados junto às rotas em `src/routes/`.

```bash
yarn test
```

## Deploy

- Hospedado na **Vercel** (`vercel.json`: todas as rotas reescritas para a serverless function, assets em `public/`).
- **Cron** da Vercel chama `GET /athos_adm/api/internal/cron/media-youtube-sync` a cada 6 horas (sync de mídia do YouTube), protegido por `CRON_SECRET`.
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

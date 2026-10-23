# Athos Management API

## Hospedagem

A API e o site estão hospedados na **Hostinger** (app Node.js rodando `src/server.ts` / `dist/server.js`), não na Vercel. Não proponha soluções dependentes da Vercel (Vercel Blob, funções serverless, limites da Vercel etc.).

Arquivos enviados (áudios da rádio) ficam no disco do servidor, em `UPLOAD_DIR`, servidos em `/athos_adm/api/uploads`.

# Status — Plano de Comercialização

**Plano:** [`PLANO_Comercializacao.md`](./PLANO_Comercializacao.md)
**Requisitos:** [`URS_Comercializacao.md`](./URS_Comercializacao.md)
**Última atualização:** 23/11/2026

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
| 0 | Fundação (documentos legais, aceites, feature flags) | Não iniciada | — | — | 0/7 |
| 1 | Termos, Política, Contrato e DPA | Não iniciada | — | — | 0/10 |
| 2 | Consentimento dos membros (LGPD) | Não iniciada | — | — | 0/8 |
| 3 | PIX provisório e fim do fluxo simulado | Não iniciada | — | — | 0/7 |
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

- [ ] 0.1 Model `LegalDocument`
- [ ] 0.2 Model `LegalAcceptance` (somente inserção)
- [ ] 0.3 Rotas `/legal/:type/current`, `/legal/:type/accept`, `/legal/pending`
- [ ] 0.4 Bloqueio de update/delete em aceites + `AuditLog`
- [ ] 0.5 Feature flags em `Church.settings.features` + `requireFeature`
- [ ] 0.6 Migração da igreja-piloto (`radio: true` provisório)
- [ ] 0.7 Testes de integração

## Sprint 1 — Termos, Política de Privacidade, Contrato e DPA

- [ ] 1.1 Termos de Uso genéricos
- [ ] 1.2 Política de Privacidade
- [ ] 1.3 Minuta do Contrato SaaS
- [ ] 1.4 DPA
- [ ] 1.5 Seed dos documentos v1
- [ ] 1.6 Páginas públicas no site e no app lidas da API
- [ ] 1.7 Aceite do contrato pelo representante legal no painel
- [ ] 1.8 Modal de reaceite
- [ ] 1.9 Exportação da evidência de aceite
- [ ] 1.10 Revisão do advogado incorporada (v2)

## Sprint 2 — Consentimento dos membros (LGPD)

- [ ] 2.1 Cadastro com aceite e consentimento separados
- [ ] 2.2 Bloqueio de `medicalRecord` sem consentimento
- [ ] 2.3 Consentimento em nome de menores
- [ ] 2.4 Revogação do consentimento
- [ ] 2.5 Tratamento dos usuários existentes
- [ ] 2.6 Exclusão de dados cobrindo sensíveis e filhos
- [ ] 2.7 Exportação dos dados do titular
- [ ] 2.8 Testes

## Sprint 3 — PIX provisório e fim do fluxo simulado

- [ ] 3.1 Campo `Church.pix`
- [ ] 3.2 Geração do BR Code estático
- [ ] 3.3 Cadastro da chave no painel
- [ ] 3.4 Tela de ofertas no site e no app
- [ ] 3.5 Remover `stripe`/`pagarme`; padrão `mercadopago`
- [ ] 3.6 Mock desligado em produção
- [ ] 3.7 Webhook atual fechado ou protegido

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
- [ ] NT-04 Revisão jurídica contratada
- [ ] NT-05 Roteiro de demonstração e mensagem de indicação

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

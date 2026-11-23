# Documentos legais (minutas)

Modelos dos documentos jurídicos publicados pela plataforma (`LegalDocument`). São **minutas**
preparadas internamente e **ainda precisam de revisão por advogado** de tecnologia/LGPD
(tarefa 1.10 do `PLANO_Comercializacao.md`) antes do primeiro cliente pagante.

| Arquivo | Tipo (`type`) | Quem aceita |
|---|---|---|
| `terms.md` | `terms` | Todo usuário |
| `privacy.md` | `privacy` | Todo usuário |
| `saas_contract.md` | `saas_contract` | Representante legal da igreja (admin) |
| `dpa.md` | `dpa` | Representante legal da igreja (admin) |
| `radio_liability.md` | `radio_liability` | Admin da igreja, ao ativar a rádio (opcional) |
| `sensitive_data_consent.md` | `sensitive_data_consent` | Titular, ou o responsável em nome do filho (opcional) |

## Formato

- A **primeira linha** é o título, no formato `# Título`. O restante é o conteúdo (markdown).
- Placeholders preenchidos na exibição:
  - `{{churchName}}`, `{{churchSlug}}`, `{{churchEmail}}`: dados da igreja.
  - `{{platformName}}`: "Athos Management".
  - `{{providerName}}`, `{{providerDocument}}`, `{{providerEmail}}`, `{{forumCity}}`: dados do
    fornecedor, vindos das variáveis `LEGAL_PROVIDER_NAME`, `LEGAL_PROVIDER_DOCUMENT`,
    `LEGAL_PROVIDER_EMAIL` e `LEGAL_FORUM_CITY`.

## Publicar

```bash
npm run legal:publish            # publica nova versão de cada arquivo alterado (exige novo aceite)
npm run legal:publish -- --minor # correção menor: publica sem exigir novo aceite
```

O script compara o arquivo com a última versão publicada e só publica o que mudou. Versões
publicadas nunca são editadas.

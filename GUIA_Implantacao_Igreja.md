# Guia de Implantação de uma Igreja Nova

Como colocar uma igreja no ar na plataforma Athos Management **sem deploy** (URS-TEN-04). No ensaio feito na Sprint 7, os passos no sistema levaram poucos minutos; o tempo real depende principalmente do DNS do domínio e da coleta de dados com a igreja.

## Antes de começar (com a igreja)

| Item | Quem fornece |
|---|---|
| Nome da igreja e endereço curto (slug) desejado | Igreja |
| Nome e e-mail do administrador | Igreja |
| Representante legal (nome, CPF, cargo) e CNPJ da igreja — para o aceite do contrato | Igreja |
| Domínio próprio (ex.: `suaigreja.org.br`) ou uso de um subdomínio da plataforma | Igreja / Athos |
| Logo, foto do templo, cores | Igreja |
| Planilha de membros (CSV) — opcional | Igreja |
| Chave PIX da conta da igreja e/ou conta do Mercado Pago | Igreja |

## 1. Criar a igreja (equipe Athos)

1. Entre no site com um usuário `devAdmin` e acesse **`/plataforma`**.
2. Em **Nova igreja**, preencha nome, slug (opcional), domínios e o administrador.
3. Clique em **Criar igreja**. O administrador recebe um e-mail explicando como criar a senha ("Esqueci minha senha").

Na mesma tela ficam, por igreja: membros, armazenamento usado e limite, mensagens de IA e ofertas pagas nos últimos 30 dias, e se o Mercado Pago está conectado. O limite de armazenamento padrão é `CHURCH_STORAGE_LIMIT_MB` (2 GB) e pode ser alterado por igreja.

## 2. Ligar o domínio (Hostinger)

O site é **um só** para todas as igrejas: a igreja é descoberta pelo endereço acessado. Basta fazer o domínio da igreja apontar para o **mesmo site** já publicado na Hostinger e cadastrá-lo na plataforma (passo 1 ou no botão "Editar domínios" em `/plataforma`).

> Os nomes de menus abaixo são os do hPanel da Hostinger no momento desta versão; confira se mudaram.

**Opção A — subdomínio da plataforma** (ex.: `esperanca.seudominio.com.br`, mais rápido):

1. hPanel → **Domínios** → domínio da plataforma → **DNS / Nameservers**.
2. Crie um registro `CNAME` com nome `esperanca` apontando para o domínio principal do site (ou um registro `A` para o IP do servidor).
3. Em **Sites** → site do Athos → **Domínios** (ou "Domínios adicionais / estacionados"), adicione `esperanca.seudominio.com.br` ao mesmo site.
4. Ative o **SSL** para o novo endereço (o hPanel emite o certificado gratuito).

**Opção B — domínio próprio da igreja** (ex.: `suaigreja.org.br`):

1. No registro do domínio (Registro.br ou outro), aponte o DNS: `A` para o IP do servidor da Hostinger (e `CNAME www` para o domínio), ou troque os nameservers para os da Hostinger.
2. No hPanel, adicione o domínio ao **mesmo site** (domínio adicional/estacionado, não um site novo).
3. Ative o SSL.
4. Cadastre `suaigreja.org.br` na plataforma (o `www.` é tratado automaticamente).

Variáveis do site relacionadas:

| Variável (site) | Uso |
|---|---|
| `NEXT_PUBLIC_CHURCH_SLUG` | Se definida, o site atende **só** essa igreja e não faz a descoberta pelo endereço. Deixe vazia no site multi-igreja. |
| `NEXT_PUBLIC_DEFAULT_CHURCH_SLUG` | Igreja usada quando o endereço não está cadastrado. Padrão: `principios-de-vida` (compatibilidade com a igreja-piloto). Defina vazio (`""`) para mostrar "Site não encontrado". |
| `NEXT_PUBLIC_SITE_TITLE` | Título inicial da aba antes do carregamento (depois vira o nome da igreja). |

Na API, inclua o novo endereço (com `https://`) em `CORS_ORIGINS`.

## 3. Primeiro acesso do administrador (igreja)

1. Criar a senha em **Esqueci minha senha**.
2. Aceitar Termos e Política; o **representante legal** aceita o Contrato e o DPA no painel.
3. **Geral**: logo, endereço, contatos, horários de culto.
4. **Aparência**: cores, fonte, foto do topo, favicon e ordem das seções da home.
5. **Usuários → Importar planilha**: baixar o modelo, conferir e importar. Os membros entram ativos e criam a senha por "Esqueci minha senha".
6. **Ofertas**: chave PIX e/ou **Conectar Mercado Pago**.
7. **Rádio** (opcional): só depois de ler e aceitar o termo de responsabilidade sobre ECAD.

## 4. App

O app é **único** (decisão P3): o membro baixa o app "Athos" nas lojas e escolhe a igreja em **Encontre sua igreja** no cadastro. Não há publicação nova nas lojas por igreja.

## 5. Conferência final

- [ ] O site abre no domínio da igreja com o nome, a logo e as cores certas.
- [ ] O admin entra no painel e o contrato aparece como aceito em **Documentos legais**.
- [ ] Um membro importado consegue criar a senha e entrar no app.
- [ ] Uma oferta de teste gera o PIX (e, com Mercado Pago, confirma sozinha).

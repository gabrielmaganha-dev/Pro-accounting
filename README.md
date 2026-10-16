#Pro accounting - Sistema Contabil

## Deploy na Vercel

O projeto inteiro (frontend + API) roda em um único projeto da Vercel, no mesmo
domínio: o frontend é servido como site estático e a API do Fastify roda como
função serverless em `/api` (ver `vercel.json` e `api/index.js`).

A cada deploy, `scripts/vercel-build.mjs` compila o backend, aplica as
migrations pendentes (`prisma migrate deploy`), cria o administrador (se
configurado) e compila o frontend.

> **Estado atual: sistema completo, do cadastro ao controle de acesso.**
>
> `Cliente → Contrato → Fatura → Pagamento` funciona de ponta a ponta:
>
> - **Infraestrutura** — autenticação JWT, banco, layout e a ligação frontend ↔ API.
> - **Clientes** — cadastro, edição, busca, filtros, ordenação, paginação, inativação,
>   exclusão protegida, histórico de alterações e as faturas do cliente.
> - **Contratos** — cadastro, edição, busca, filtros, ordenação, paginação, encerramento,
>   cancelamento, renovação com reajuste, exclusão protegida e o financeiro por contrato.
> - **Faturas** — emissão, edição, busca, filtros por período e valor, paginação,
>   cancelamento e reabertura, exclusão protegida e histórico de auditoria.
> - **Pagamentos** — registro com confirmação em duas etapas, proteção contra duplicata,
>   pagamento parcial, estorno e o histórico de caixa com filtros e total do período.
> - **Financeiro** — resumo em seis cards, seis períodos, gráficos de receita, formas de
>   recebimento e situação das faturas, tabela do período e exportação em CSV, Excel e PDF.
>   **Restrito a administradores.**
> - **Notificações** — sino no cabeçalho com alertas persistidos de fatura atrasada,
>   vencimento próximo e contrato a vencer, com estado de leitura por usuário.
> - **Usuários e permissões** — cadastro, busca, filtros, troca de perfil, inativação,
>   exclusão protegida, reset de acesso com senha provisória de uso único e troca da
>   própria senha. **Restrito a administradores.**
> - **Relatórios** — 15 relatórios de clientes, contratos, faturas e financeiro, com
>   filtros de período, cliente e situação, e exportação em **CSV, Excel e PDF**.
>   Os financeiros são restritos a administradores.
> - **Configurações** — dados da empresa, logotipo e cores da marca aplicadas ao sistema
>   inteiro, perfil do usuário com troca de senha, e preferências gerais
>   (antecedência de vencimento, moeda, fuso horário, formato de data).
> - **Auditoria** — trilha append-only de quem fez o quê, quando e de onde: login,
>   tentativa recusada, logout, criação, alteração, inativação, cancelamento,
>   pagamento, estorno, mudança de perfil, reset de acesso e exportação de dados.
>   **Restrita a administradores.**
> - **Painel** — indicadores, gráficos, alertas e atividade recente, todos com dados reais.
>
> Nenhuma tela do menu é marcador: todas estão construídas.
>
> **Pronto para produção:** imagens Docker da API e da interface, compose com PostgreSQL,
> HTTPS automático, backup e restauração — ver a [seção 16](#16-produção).

| Variável         | Obrigatória | Observação                                                                 |
| ---------------- | ----------- | -------------------------------------------------------------------------- |
| `JWT_SECRET`     | sim         | Mínimo de 32 caracteres. Gere com `openssl rand -base64 48`.               |
| `DATABASE_URL`   | sim\*       | \*Dispensável se o Supabase estiver conectado em **Storage** na Vercel: a integração injeta `POSTGRES_PRISMA_URL` e `POSTGRES_URL_NON_POOLING`, que são usadas automaticamente. |
| `DIRECT_URL`     | não         | Conexão usada só pelas migrations, quando `DATABASE_URL` for um pooler em modo transação. |
| `ADMIN_EMAIL`    | não         | Com `ADMIN_PASSWORD`, cria o administrador no deploy. Nunca sobrescreve a senha de um admin existente. |
| `ADMIN_PASSWORD` | não         | Mínimo de 8 caracteres.                                                    |
| `ADMIN_NAME`     | não         | Padrão: "Administrador".                                                   |

## Sumário

1. [Tecnologias](#1-tecnologias)
2. [Estrutura do projeto](#2-estrutura-do-projeto)
3. [Requisitos](#3-requisitos)
4. [Instalação passo a passo](#4-instalação-passo-a-passo)
5. [Executando o sistema](#5-executando-o-sistema)
6. [Variáveis de ambiente](#6-variáveis-de-ambiente)
7. [Credenciais do administrador](#7-credenciais-do-administrador)
8. [Como testar o login](#8-como-testar-o-login)
9. [Rotas da API](#9-rotas-da-api)
10. [Modelo de dados](#10-modelo-de-dados)
11. [Scripts disponíveis](#11-scripts-disponíveis)
12. [Segurança](#12-segurança)
13. [Solução de problemas](#13-solução-de-problemas)
14. [Trocar o logotipo](#14-trocar-o-logotipo)
15. [Próximas etapas](#15-próximas-etapas)
16. [Produção](#16-produção) — deploy, HTTPS, backup, restauração, checklist e Vercel
17. [Login com Google](#17-login-com-google) — Google Cloud, Supabase Auth e aprovação de cadastros

---

## 1. Tecnologias

| Camada         | Tecnologia                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Frontend       | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form, Zod, Lucide |
| Backend        | Node.js 20+, TypeScript, Fastify 5, Zod                                     |
| Banco de dados | PostgreSQL 16+ (verificado com 18.6) + Prisma ORM                           |
| Autenticação   | JWT (`@fastify/jwt`) + hash de senha com bcrypt                             |
| Infra local    | Docker Compose (apenas o PostgreSQL)                                        |
| Produção       | Docker Compose: nginx + API + PostgreSQL, HTTPS com Caddy, backup por `pg_dump` |

**Duas escolhas que merecem explicação:**

- **Fastify em vez de Express** — conforme solicitado. Traz validação, logging estruturado (pino) e tipagem melhor por padrão.
- **`bcryptjs` em vez de `bcrypt`/`argon2`** — `bcrypt` e `argon2` são módulos nativos e exigem compilador C++ quando não há binário pronto para a plataforma. Em Windows sem o Visual Studio Build Tools, isso quebra o `npm install` com um erro difícil de diagnosticar. `bcryptjs` é JavaScript puro e instala em qualquer ambiente. Todo o hashing está isolado em `backend/src/utils/password.ts` — migrar para Argon2id depois é reescrever um arquivo só.

---

## 2. Estrutura do projeto

```text
pro-accounting/
├── docker-compose.yml             # PostgreSQL local (desenvolvimento)
├── docker-compose.production.yml  # produção: banco, migrations, API, nginx, backup, HTTPS
├── .env.example                   # credenciais do banco de desenvolvimento
├── .env.production.example        # todas as variáveis de produção, comentadas
├── package.json                   # atalhos que chamam frontend e backend
│
├── deploy/
│   ├── backup/                 # backup.sh, restore.sh e o agendador
│   └── caddy/Caddyfile         # HTTPS automático (perfil "https")
├── scripts/
│   └── smoke-test.sh           # confere uma instalação de fora (seção 16.11)
│
├── backend/
│   ├── Dockerfile              # imagem de produção da API
│   ├── prisma/
│   │   ├── schema.prisma       # modelo de dados
│   │   └── migrations/         # histórico versionado do banco
│   ├── .env.example
│   └── src/
│       ├── config/             # env validado + cliente Prisma
│       ├── controllers/        # entrada/saída HTTP
│       ├── services/           # regra de negócio
│       ├── reports/            # núcleo de relatórios (ver seção 9)
│       │   ├── definitions/    # um arquivo por grupo de relatórios
│       │   └── formatters/     # CSV, XLSX e PDF — sem dependências
│       ├── routes/             # definição das rotas
│       ├── middlewares/        # autenticação, autorização, erros
│       ├── validators/         # schemas Zod de entrada
│       ├── utils/              # senha, erros, datas, documentos
│       ├── types/              # tipos e augmentação do Fastify
│       ├── database/
│       │   ├── seed.ts         # cria o administrador inicial
│       │   └── seed-demo.ts    # popula dados de demonstração
│       ├── app.ts              # monta a aplicação (sem abrir porta)
│       └── server.ts           # sobe o servidor
│
└── frontend/
    ├── Dockerfile              # imagem de produção: build + nginx
    ├── nginx/                  # configuração do nginx e cabeçalhos de segurança
    ├── .env.example
    ├── .env.production         # VITE_API_URL=/api (versionado: não tem segredo)
    ├── tailwind.config.js      # paleta da marca
    └── src/
        ├── assets/             # logo.svg, logo-mark.svg, LOGO.md
        ├── components/
        │   ├── ui/             # shadcn/ui
        │   ├── brand/          # <Logo />
        │   ├── layout/         # menu lateral e barra superior
        │   ├── dashboard/      # cards, gráficos, alertas
        │   ├── clients/        # formulário, seletor de cliente, selo
        │   ├── contracts/      # formulário, renovação, selo
        │   ├── invoices/       # formulário, registro de pagamento, selo
        │   ├── finance/        # gráficos do módulo financeiro
        │   ├── notifications/  # sino e painel de alertas
        │   ├── users/          # formulário, reset, troca de senha, selos
        │   ├── reports/        # catálogo, filtros, tabela e exportação
        │   ├── settings/       # empresa, identidade visual, perfil, preferências
        │   ├── audit/          # selo de ação e detalhe do evento
        │   └── common/         # paginação, ordenação, estados vazio e de erro, loader
        ├── contexts/           # estado de autenticação
        ├── hooks/
        ├── layouts/            # AppLayout, AuthLayout
        ├── lib/                # utilitários, query client, env, tema em execução
        ├── pages/
        │   ├── clients/        # lista, ficha e formulário
        │   ├── contracts/      # lista, ficha e formulário
        │   ├── invoices/       # lista, ficha e formulário
        │   ├── payments/       # histórico de caixa (só leitura)
        │   ├── users/          # gerenciamento de acesso (só ADMIN)
        │   ├── reports/        # relatórios e exportação
        │   ├── settings/       # configurações do sistema e do perfil
        │   └── audit/          # trilha de auditoria (só ADMIN)
        ├── routes/             # mapa de rotas e guards
        ├── services/           # cliente HTTP e chamadas à API
        ├── types/
        └── utils/              # formatação pt-BR, máscaras, política de senha
```

---

## 3. Requisitos

Instale, nesta ordem:

### 3.1 Node.js 20 LTS ou superior

Baixe o instalador LTS em <https://nodejs.org>. Aceite as opções padrão.

Conferir depois de instalar (**abra um terminal novo**, senão o PATH ainda não estará atualizado):

```powershell
node --version   # deve mostrar v20.x ou superior
npm --version
```

### 3.2 PostgreSQL 16 ou superior

Você tem duas opções. **Escolha uma** — as duas na porta 5432 entram em conflito.

**Opção A — PostgreSQL instalado no Windows.** Baixe em <https://www.postgresql.org/download/windows/>.
Durante a instalação, **anote a senha do usuário `postgres`** — ela é pedida no Passo 6.
O instalador não adiciona o `psql` ao PATH; ele fica em
`C:\Program Files\PostgreSQL\<versão>\bin\psql.exe`.

Conferir se o serviço está rodando:

```powershell
Get-Service -Name "*postgres*"
```

**Opção B — Docker Desktop.** Não instala PostgreSQL na máquina e é fácil de remover.
Baixe em <https://www.docker.com/products/docker-desktop/>, instale, reinicie e **abra** o Docker
Desktop (precisa estar em execução, não apenas instalado).

O `docker-compose.yml` expõe a porta **5433**, não 5432, para conviver com uma instalação nativa
sem conflito. Se usar esta opção, a `DATABASE_URL` precisa apontar para `5433`.

### 3.3 Git (opcional)

Necessário apenas para versionar o projeto: <https://git-scm.com/download/win>

---

## 4. Instalação passo a passo

Todos os comandos rodam na pasta raiz do projeto, salvo indicação em contrário.

### Passo 1 — Instalar as dependências

```powershell
npm run install:all
```

Isso instala o backend e o frontend. Demora alguns minutos na primeira vez.

### Passo 1b — Liberar os scripts de instalação (npm 11 ou superior)

**Este passo é obrigatório e fácil de pular sem perceber.**

A partir do npm 11, scripts de instalação de dependências são **bloqueados por padrão** (é uma
proteção contra pacotes maliciosos). Ao final do Passo 1 aparece:

```text
npm warn install-scripts 4 packages have install scripts not yet covered by allowScripts
```

Na prática, isso significa que **o cliente do Prisma não foi gerado** e que **o binário do esbuild
não foi baixado** — sem eles nem a API nem a interface sobem. Libere os quatro pacotes:

```powershell
npm --prefix backend install-scripts approve prisma "@prisma/client" "@prisma/engines" esbuild
npm --prefix frontend install-scripts approve esbuild
```

A aprovação fica registrada no campo `allowScripts` de cada `package.json`, então só precisa ser
feita uma vez (e vale para quem clonar o repositório depois).

Conferir se funcionou:

```powershell
npx --prefix backend tsx --version     # deve imprimir a versão do tsx
npx --prefix frontend vite --version   # deve imprimir a versão do Vite
```

### Passo 2 — Criar os arquivos `.env`

São **três**, um para cada parte. Nenhum deles vai para o Git.

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

### Passo 3 — Definir a senha do banco

Abra o `.env` da **raiz** e troque a senha:

```dotenv
POSTGRES_PASSWORD=escolha-uma-senha-forte
```

Abra o `backend\.env` e use **a mesma senha** na `DATABASE_URL`:

```dotenv
DATABASE_URL="postgresql://pro_accounting:escolha-uma-senha-forte@localhost:5432/pro_accounting?schema=public"
```

> Se a senha tiver `@`, `:`, `/` ou `?`, ela precisa ser codificada na URL. Para evitar dor de cabeça, use apenas letras, números, `-` e `_`.

### Passo 4 — Gerar o segredo do JWT

Ainda no `backend\.env`, substitua `JWT_SECRET` por um valor aleatório:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Copie a saída e cole:

```dotenv
JWT_SECRET=<cole-o-valor-gerado-aqui>
```

> O servidor recusa iniciar se o segredo tiver menos de 32 caracteres. Isso é proposital.

### Passo 5 — Definir a senha do administrador

Ainda no `backend\.env`:

```dotenv
ADMIN_NAME="Seu Nome"
ADMIN_EMAIL=seuemail@proaccounting.com.br
ADMIN_PASSWORD=troque-esta-senha-do-admin
```

### Passo 6 — Preparar o banco de dados

#### Se você escolheu a Opção A (PostgreSQL instalado no Windows)

Crie o usuário e o banco da aplicação. Ajuste o caminho do `psql` para a sua versão e informe a
senha do usuário `postgres` quando solicitado:

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

& $psql -U postgres -h localhost -c "CREATE ROLE pro_accounting WITH LOGIN PASSWORD 'troque-esta-senha';"
& $psql -U postgres -h localhost -c "CREATE DATABASE pro_accounting OWNER pro_accounting ENCODING 'UTF8';"
& $psql -U postgres -h localhost -c "ALTER ROLE pro_accounting CREATEDB;"
```

**Por que o `CREATEDB`:** o `prisma migrate dev` cria um banco temporário (*shadow database*) para
comparar o schema e detectar alterações feitas fora das migrations. Sem essa permissão a migration
falha com `P3014: Prisma Migrate could not create the shadow database`. É necessário apenas em
desenvolvimento — em produção usa-se `prisma migrate deploy`, que não precisa de shadow database e,
portanto, não precisa desta permissão.

Confirme que o usuário da aplicação consegue entrar:

```powershell
$env:PGPASSWORD = "troque-esta-senha"
& $psql -U pro_accounting -h localhost -d pro_accounting -tAc "SELECT current_user;"
$env:PGPASSWORD = ""
```

#### Se você escolheu a Opção B (Docker)

```powershell
docker compose up -d
docker compose ps
```

A coluna `STATUS` deve mostrar `healthy` após alguns segundos. Lembre-se de que a porta é **5433**:
ajuste a `DATABASE_URL` em `backend/.env` para `@localhost:5433`.

### Passo 7 — Criar as tabelas

```powershell
npm run db:migrate
```

Quando ele pedir um nome para a migração, digite:

```text
init
```

### Passo 8 — Criar o administrador

```powershell
npm run db:seed
```

Você deve ver:

```text
  Administrador criado com sucesso.
   Nome:   Seu Nome
   E-mail: seuemail@proaccounting.com.br
   Perfil: ADMIN
```

---

## 5. Executando o sistema

Frontend e backend rodam em processos separados. **Abra dois terminais.**

**Terminal 1 — API:**

```powershell
npm run dev:api
```

Esperado:

```text
PostgreSQL conectado.
API disponível em http://localhost:3333/api
Health check:     http://localhost:3333/api/health
```

**Terminal 2 — interface:**

```powershell
npm run dev:web
```

Esperado:

```text
  ➜  Local:   http://localhost:5173/
```

Abra <http://localhost:5173> no navegador.

---

## 6. Variáveis de ambiente

### Raiz — `.env` (Docker Compose)

| Variável            | Exemplo          | Para que serve                                |
| ------------------- | ---------------- | --------------------------------------------- |
| `POSTGRES_DB`       | `pro_accounting` | Nome do banco criado no container             |
| `POSTGRES_USER`     | `pro_accounting` | Usuário dono do banco                         |
| `POSTGRES_PASSWORD` | *(sua senha)*    | Senha do banco. Sem padrão — o compose exige  |
| `POSTGRES_PORT`     | `5432`           | Porta exposta na máquina                      |

### `backend/.env`

| Variável             | Exemplo                       | Para que serve                                       |
| -------------------- | ----------------------------- | ---------------------------------------------------- |
| `NODE_ENV`           | `development`                 | Ambiente. Em `production`, erros não expõem detalhes  |
| `PORT`               | `3333`                        | Porta da API                                          |
| `HOST`               | `0.0.0.0`                     | Interface de escuta                                   |
| `DATABASE_URL`       | `postgresql://...`            | Conexão com o PostgreSQL                              |
| `JWT_SECRET`         | *(aleatório, 32+ caracteres)* | Assina os tokens. **Nunca versionar**                 |
| `JWT_EXPIRES_IN`     | `1d`                          | Validade do token (`15m`, `2h`, `1d`, `7d`)           |
| `BCRYPT_SALT_ROUNDS` | `12`                          | Custo do hash de senha                                |
| `CORS_ORIGIN`        | `http://localhost:5173`       | Origens autorizadas, separadas por vírgula. **Obrigatória em produção** |
| `LOG_LEVEL`          | `info`                        | Nível mínimo do log (`fatal` … `trace`)               |
| `TRUST_PROXY`        | `true`                        | Confiar em `X-Forwarded-*`. `false` se a API for exposta sem proxy |
| `ADMIN_NAME`         | `Administrador`               | Usado só pelo seed                                    |
| `ADMIN_EMAIL`        | `admin@...`                   | Usado só pelo seed                                    |
| `ADMIN_PASSWORD`     | *(sua senha)*                 | Usado só pelo seed. Gravado com hash                  |
| `SUPABASE_URL`       | `https://<ref>.supabase.co`   | Login com Google (opcional) — [seção 17](#17-login-com-google) |
| `SUPABASE_ANON_KEY`  | *(chave pública)*             | Login com Google (opcional). **Nunca** a service role |

### `frontend/.env`

| Variável       | Exemplo                      | Para que serve            |
| -------------- | ---------------------------- | ------------------------- |
| `VITE_API_URL` | `http://localhost:3333/api`  | Endereço base da API      |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | Login com Google (opcional) |
| `VITE_SUPABASE_ANON_KEY` | *(chave pública)* | Login com Google (opcional) |

> **Atenção:** no Vite, toda variável `VITE_*` é embutida no JavaScript enviado ao navegador e fica visível para qualquer usuário. Nunca coloque segredo em variável `VITE_`.

O build de produção lê `frontend/.env.production`, que define `VITE_API_URL=/api` (caminho relativo:
interface e API saem pelo mesmo endereço). Sem a variável, o build de produção também assume `/api`
— nunca `localhost`.

### Produção — `.env.production` (raiz)

As variáveis do compose de produção estão na [seção 16.3](#163-configuração). Em produção a API
valida a configuração com mais rigor: recusa o `JWT_SECRET` e a senha de banco dos arquivos de
exemplo, exige `CORS_ORIGIN` e rejeita origem com caminho ou curinga.

---

## 7. Credenciais do administrador

**Não existem credenciais fixas no código.** O administrador é criado pelo seed a partir das variáveis de ambiente — com uma senha **escolhida por você**: o repositório é público, e em produção o seed recusa as senhas de exemplo dele.

```dotenv
ADMIN_NAME="Seu Nome"
ADMIN_EMAIL=seuemail@proaccounting.com.br
ADMIN_PASSWORD=troque-esta-senha-do-admin
```

O que acontece ao rodar `npm run db:seed`:

1. A senha é transformada em hash bcrypt (custo 12).
2. Apenas o hash vai para o banco — a senha em texto puro nunca é gravada nem registrada em log.
3. Se o administrador **já existir**, o seed atualiza nome e perfil, mas **não sobrescreve a senha**. Isso evita que um `db:seed` acidental reverta a senha meses depois.

Para recomeçar do zero (**apaga todos os dados**):

```powershell
npm run db:reset
```

---

## 8. Como testar o login

### 8.1 Pela interface

1. Abra <http://localhost:5173> — você é redirecionado para `/login`.
2. Informe o `ADMIN_EMAIL` e o `ADMIN_PASSWORD` do `backend/.env`.
3. Clique em **Entrar** → vai para `/dashboard`.
4. No topo direito, o selo verde **Sistema online** confirma que o frontend fala com a API e que a API fala com o PostgreSQL.
5. Recarregue a página (F5): você continua logado — a sessão é revalidada via `GET /api/auth/me`.
6. Clique no seu nome → **Sair**: volta para `/login`.
7. Tente abrir <http://localhost:5173/dashboard> deslogado: é barrado e redirecionado.

### 8.2 Pelo terminal

Health check:

```powershell
curl http://localhost:3333/api/health
```

Login (troque e-mail e senha pelos seus):

```powershell
curl -X POST http://localhost:3333/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"seuemail@proaccounting.com.br\",\"password\":\"SUA-SENHA\"}'
```

Resposta esperada:

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "expiresIn": "1d",
    "user": { "id": "...", "name": "...", "email": "...", "role": "ADMIN" }
  }
}
```

Usando o token:

```powershell
curl http://localhost:3333/api/auth/me -H "Authorization: Bearer <cole-o-token-aqui>"
```

Senha errada deve devolver **401** com `"E-mail ou senha incorretos."` — a mesma mensagem de e-mail inexistente, de propósito (ver [Segurança](#12-segurança)).

### 8.3 Testando o módulo de clientes

Rode `npm run db:seed:demo` antes, senão as telas abrem vazias.

1. **Painel** — os cards trazem números reais; os gráficos e os alertas de vencimento
   refletem as faturas criadas pelo seed.
2. **Clientes** — a busca aceita nome, e-mail e CPF/CNPJ **com ou sem máscara** (digite
   `123.456` e também `123456`). Os filtros ficam na URL: aplique um, abra um cliente,
   volte pelo botão do navegador — o filtro continua lá.
3. **Novo cliente** — digite um CPF/CNPJ inválido e tente salvar. A recusa vem com
   `CPF ou CNPJ inválido` antes de tocar no banco: o dígito verificador é conferido de
   verdade. Tente também um documento já cadastrado — a mensagem diz de quem é.
4. **Ficha do cliente** — quatro abas:
   - *Dados cadastrais*: campos vazios aparecem como "Não informado", nunca em branco;
   - *Contratos*: os contratos do cliente com vigência e valor mensal;
   - *Faturas*: paginadas, com filtro por situação. Em **Clínica Vida Saudável** o
     filtro *Atrasadas* traz faturas vencidas; a coluna **Em aberto** mostra o saldo
     restante, que é o que revela pagamento parcial;
   - *Histórico*: edite um telefone e volte aqui — a linha mostra o valor antigo riscado
     ao lado do novo, com autor e horário.
5. **Inativar** — só aparece para o administrador. O cliente some do filtro *Ativos* e
   dos indicadores, mas contratos e faturas permanecem intactos.
6. **Excluir** — em um cliente com faturas, a API recusa com **409** explicando o motivo
   e sugerindo inativar. Em um cliente recém-criado, sem histórico, a exclusão passa.

### 8.4 Testando o módulo de contratos

1. **Listagem** — a busca aceita número do contrato, tipo de serviço e também **nome ou
   documento do cliente**. O botão *Vencendo em 30 dias* filtra os contratos com término
   próximo; contratos por prazo indeterminado não aparecem nele, por não terem término.
2. **Novo contrato** — o número vem sugerido (`CT-<ano>-<sequência>`) e pode ser
   substituído. O valor mensal se preenche da direita para a esquerda: digitar `150000`
   resulta em `1.500,00`. Deixe o término em branco para prazo indeterminado.
3. **Validações** — tente salvar sem escolher cliente, com valor `0` e com término
   anterior ao início: as três são recusadas com a mensagem no campo certo. Um número já
   usado devolve **409** dizendo de quem é o contrato.
4. **Ficha** — os quatro cards trazem total faturado, recebido, pendente e atrasado
   **daquele contrato**. As abas mostram os dados do contrato, o cliente (com link para a
   ficha dele) e as faturas paginadas com filtro por situação.
5. **Renovar** — só para administradores, e só em contrato com término definido. O
   diálogo sugere mais 12 meses e permite reajustar o valor. O contrato volta a *Ativo* e
   **mantém todas as faturas** — confira que o total faturado não zerou.
6. **Encerrar** — o contrato sai dos ativos. Se o término estava no futuro, passa a
   constar como **hoje**; o diálogo avisa antes de confirmar.
7. **Cancelar** — diferente de encerrar: as datas não mudam e o contrato não pode mais
   ser renovado (a API responde **409** se tentar).
8. **Excluir** — recusado com **409** em contrato com faturas, sugerindo encerrar.
   Permitido em um contrato recém-criado.
9. **Ida e volta com clientes** — pela ficha de um cliente, a aba *Contratos* leva à
   ficha do contrato, e o botão *Novo contrato* já abre o formulário com o cliente
   preenchido.

### 8.5 Testando o módulo de faturas

1. **Listagem** — a busca cobre número, descrição, contrato e cliente. O botão
   *Período e valor* abre os filtros de emissão, vencimento e faixa de valor, que ficam
   recolhidos por serem seis campos de uso ocasional. O rodapé soma a página exibida — e
   diz que é da página, não do filtro inteiro.
2. **Nova fatura** — escolha o cliente e depois o contrato: a lista traz **apenas os
   contratos daquele cliente**, então não há como criar um vínculo cruzado. Ao escolher o
   contrato, valor, descrição e vencimento se preenchem a partir dele, sem sobrescrever o
   que você já tiver digitado. Deixe o contrato em branco para uma fatura avulsa.
3. **A situação não é escolhida** — não existe campo de situação no formulário, de
   propósito. A fatura nasce pendente.
4. **Regra do atraso** — emita uma fatura com vencimento **ontem**: ela aparece como
   *Atrasada · 1 dia* imediatamente, sem nenhuma rotina ter rodado. Com vencimento
   **hoje**, continua pendente — só vira atrasada amanhã.
5. **Registrar pagamento** — o botão em destaque na ficha. O valor vem preenchido com o
   **saldo em aberto**, não com o valor de face: numa fatura com pagamento parcial
   anterior, o valor de face estaria errado. Lance um valor menor que o total: a fatura
   continua pendente e a listagem passa a mostrar "resta R$ …". Complete o restante e ela
   vira *Paga* na hora.
6. **Pagamento a mais é recusado** — tente lançar acima do saldo: a API responde **422**
   dizendo o saldo exato. É a proteção contra o zero a mais na digitação.
7. **Estorno** — na aba *Pagamentos* (só administradores). A fatura volta a ficar em
   aberto e o estorno aparece no histórico com o seu nome.
8. **Cancelar** — tira a fatura do faturamento preservando o documento. Em uma fatura com
   pagamento, é recusado com **409**: estorne antes.
9. **Excluir** — recusado com **409** em fatura com pagamento, sugerindo cancelar.
   Permitido em uma fatura recém-emitida.
10. **Histórico** — a aba registra emissão, cada alteração campo a campo (com o antes e o
    depois), pagamentos, estornos, quitação, cancelamento e reabertura, sempre com autor
    e horário.
11. **Coerência entre telas** — abra a ficha do cliente e a do contrato: os cards de
    recebido, pendente e atrasado refletem o que você acabou de lançar. As três telas usam
    a mesma derivação, então não podem discordar.

### 8.6 Testando o módulo de pagamentos

1. **Confirmação em duas etapas** — no botão *Registrar pagamento* de uma fatura, preencha
   e clique em **Revisar**: aparece um resumo do que será gravado, com aviso se o
   pagamento for parcial. Nada foi enviado ainda — *Corrigir* volta ao formulário.
2. **Duplicata** — registre um pagamento e tente registrar **outro idêntico** (mesmo
   valor, data e forma). A API recusa com **409**, o diálogo permanece aberto e o botão
   passa a oferecer *Registrar assim mesmo*, em vermelho. Trocar a forma de pagamento já
   é suficiente para não ser considerado duplicata.
3. **Parcial** — lance menos que o saldo: a fatura continua em aberto, a revisão avisa
   quanto restará, e a listagem de faturas passa a mostrar "resta R$ …".
4. **Recusas** — valor negativo, zero, acima do saldo, e pagamento em fatura cancelada.
5. **Histórico de pagamentos** (*Pagamentos* no menu) — a visão de caixa, com Cliente,
   Fatura, Valor, Data, Método e Usuário. Os atalhos **Hoje** e **Este mês** respondem o
   fechamento do dia; o card no topo traz o total **do filtro**, não da página.
6. **Conferência** — filtre por cliente e compare o total com o card *Recebido* da ficha
   dele: os dois números vêm da mesma fonte e precisam bater.
7. **Estorno** — na aba *Pagamentos* da fatura (só administradores). O lançamento some do
   histórico de caixa e a fatura volta a ficar em aberto.

### 8.7 Testando o módulo financeiro

Entre como **administrador**: o item *Financeiro* não aparece para o perfil funcionário, e
a API recusa com **403** mesmo que ele digite o endereço.

1. **Períodos** — os seis botões. O subtítulo da tela mostra o intervalo que o servidor
   resolveu ("setembro de 2026", "Semana de 21/09/2026"), para não restar dúvida do que
   está sendo somado. *Personalizado* só consulta depois das duas datas preenchidas.
2. **Cards** — repare nas legendas: *Receita do mês* e *do ano* não mudam com o filtro;
   *Recebido* e *Faturado* mudam; *Pendente* e *Atrasado* são o saldo de hoje. A linha
   abaixo dos cards explica isso.
3. **Granularidade** — em *Hoje* ou *Semana* o gráfico de receita mostra barras por dia;
   em *Ano*, por mês. A troca é automática.
4. **Formas de recebimento** — barras horizontais ordenadas da maior para a menor, com o
   nome da forma no eixo. O tooltip traz o valor, a participação e a quantidade.
5. **Tabela** — Cliente, Fatura, Valor, Vencimento, Pagamento e Situação, com o total do
   período no cabeçalho. Clicar numa linha abre a fatura.
6. **Exportar CSV** — o arquivo abre direto no Excel em português, com acentos corretos e
   valores somáveis. O nome traz o período: `financeiro-2026-01-01-a-2026-09-21.csv`.
7. **Excel e PDF** — escolha um dos dois e exporte: aparece um aviso dizendo que só o CSV
   está disponível. Estão anunciados porque a estrutura já os prevê.
8. **Conferência cruzada** — o total recebido no período deve bater com o mesmo período em
   *Pagamentos*, e *Atrasado* com o card do painel. Os três leem a mesma fonte.

### 8.8 Testando as notificações

1. **O sino** — no canto superior direito, com o número de não lidas em vermelho. Abra:
   fatura atrasada em vermelho, vencimento próximo em âmbar, contrato a vencer em azul.
   Cada linha traz o cliente, o valor e quanto tempo falta ou faz.
2. **Clique numa notificação** — ela é marcada como lida e leva direto à fatura ou ao
   contrato. O ícone de visto ao lado marca como lida sem sair da tela.
3. **Marcar todas** — o botão no topo do painel. O selo zera; a caixa do outro usuário
   **não** é afetada, porque a leitura é pessoal.
4. **Resolução automática** — pegue uma fatura atrasada, registre o pagamento e volte ao
   sino: o alerta some. Estorne o pagamento e ele volta. Nenhum dos dois exige recarregar
   a página.
5. **Sem duplicatas** — deixe a tela aberta alguns minutos. O sino consulta a API
   periodicamente e a varredura roda de novo, mas o número não cresce.
6. **Mensagem que envelhece bem** — uma fatura que hoje "vence amanhã" passa a "vence
   hoje" no dia seguinte, no mesmo alerta. O texto é reescrito a cada varredura; o estado
   de leitura, não.
7. **Painel** — os alertas do painel continuam onde estavam, agrupados por urgência. O
   sino e o painel usam as mesmas janelas, então nunca discordam.

### 8.9 Testando usuários e permissões

1. **Cadastre um funcionário** em *Usuários → Novo usuário*, com uma senha que você
   consiga digitar de novo. Repare no selo **Senha provisória** ao lado do nome.
2. **Entre como ele** numa janela anônima. O sistema abre um diálogo **sem botão de
   cancelar** exigindo uma senha nova — não dá para usar o sistema sem trocar.
3. **Confirme o RBAC pela interface**: no menu lateral dele não existem *Financeiro* nem
   *Usuários*. Digite `http://localhost:5173/usuarios` na barra de endereço: o sistema
   devolve ao painel.
4. **Confirme o RBAC de verdade**, que é o que importa. Com o token dele, no terminal:

   ```bash
   curl -i -X DELETE http://localhost:3333/api/users/<id> ^
     -H "Authorization: Bearer <token-do-funcionario>"
   ```

   A resposta é **403**, e o usuário continua existindo. A interface não participou dessa
   decisão.
5. **Reset de acesso** — de volta como administrador, *Resetar acesso* no menu da linha.
   A senha provisória aparece uma vez; anote. A janela do funcionário, se ainda estiver
   aberta, cai na tela de login na próxima ação — o token dele foi invalidado.
6. **Trave a própria conta (ou tente)** — no seu próprio usuário, as opções de resetar,
   rebaixar, inativar e excluir não aparecem. Pela API, as quatro respondem **403**.
7. **Exclusão protegida** — tente excluir um usuário que já cadastrou um cliente ou
   registrou um pagamento: **409**, com a sugestão de inativar. Inative e confirme que o
   nome dele continua no histórico da fatura e no *Pagamentos*.
8. **Troca da própria senha** — menu do seu nome → *Alterar senha*. Você continua logado
   (a aplicação troca o token); qualquer outra sessão sua cai.

### 8.10 Testando os relatórios

1. **Abra *Relatórios*** — quinze cartões agrupados em Clientes, Contratos, Faturas e
   Financeiro. A descrição de cada um diz o que entra e o que fica de fora.
2. **Confira um número contra o sistema** — abra *Faturas atrasadas* e compare o total com
   a tela de Faturas filtrada por "Atrasada". São o mesmo número, porque a regra de atraso
   vem do mesmo lugar. Some *Pendentes* com *Atrasadas*: nenhuma fatura aparece nas duas.
3. **Filtre** — escolha data inicial e final, um cliente e uma situação. O texto acima da
   tabela é reescrito pelo servidor com o recorte aplicado, e é o mesmo texto que vai para
   o arquivo exportado. Repare que ele diz sobre qual data o período incide.
4. **Exporte nos três formatos** — o menu *Exportar* mostra quantos registros o arquivo
   terá. Baixe os três do mesmo relatório:
   - o **CSV** abre no Excel com as colunas separadas e os acentos certos;
   - o **Excel** traz os valores como número — selecione a coluna e veja a soma aparecer
     na barra de status. O cabeçalho já vem com filtro e congelado;
   - o **PDF** abre paginado, com o cabeçalho repetido em cada página.
5. **Confira que o arquivo carrega o contexto** — abra qualquer um dos três: as primeiras
   linhas trazem título, período, cliente, situação e a data de emissão.
6. **Teste a permissão** — entre como funcionário: o grupo *Financeiro* não aparece no
   catálogo. Agora peça direto pela API, com o token dele:

   ```bash
   curl -i "http://localhost:3333/api/reports/finance-overdue" ^
     -H "Authorization: Bearer <token-do-funcionario>"
   ```

   A resposta é **403**. Os relatórios de clientes, contratos e faturas continuam
   respondendo 200 para ele.
7. **Link compartilhável** — o relatório e os filtros ficam na barra de endereço. Copie a
   URL e abra em outra aba: volta no mesmo recorte.

### 8.11 Testando as configurações

1. **Empresa** — preencha CNPJ, telefone e CEP com máscara. Salve e recarregue: os campos
   voltam formatados, mas o banco guardou só os dígitos. Digite um CNPJ com o dígito
   verificador errado: a API recusa.
2. **Cores, com pré-visualização** — em *Identidade visual*, arraste o seletor da cor
   principal. O sistema inteiro muda de cor na hora — menu lateral, botões, selos, o item
   ativo do menu — **sem salvar nada**. Saia da aba sem salvar: volta ao que era.
3. **Veja a rampa** — abaixo dos seletores, os onze tons derivados. Escolha um amarelo
   claro: aparece o aviso de contraste dizendo que o texto branco nos botões ficará
   ilegível.
4. **Logotipo** — envie um PNG ou SVG. Ele substitui a marca no menu lateral e na tela de
   login. *Remover e usar o padrão* volta ao símbolo do sistema.
5. **Antecedência de vencimento** — o teste que prova que a preferência vale. Emita uma
   fatura com vencimento em 20 dias. Com a antecedência em 7, ela **não** aparece nos
   alertas do painel nem no sino. Mude para 30 e recarregue: a **mesma** fatura passa a
   aparecer. Sem reiniciar o servidor.
6. **Fuso horário** — muda o que o servidor entende por "hoje", que é a base de todo
   cálculo de atraso. A diferença só é observável perto da meia-noite.
7. **Perfil** — troque o seu nome: salva sem pedir senha, e a barra do topo atualiza na
   hora. Agora troque o e-mail: o formulário passa a exigir a senha atual, porque o e-mail
   é a credencial de login.
8. **Senha** — em *Meu perfil → Alterar senha*. Você continua logado (a aplicação troca o
   token); qualquer outra sessão sua cai.
9. **Permissão** — entre como funcionário: as abas de empresa, identidade visual e
   preferências aparecem em modo leitura, sem botão de salvar. Pela API:

   ```bash
   curl -i -X PUT http://localhost:3333/api/settings/appearance ^
     -H "Authorization: Bearer <token-do-funcionario>" ^
     -H "Content-Type: application/json" ^
     -d "{\"primaryColor\":\"#ff0000\"}"
   ```

   A resposta é **403**, e a cor não muda.

### 8.12 Testando a auditoria e a segurança

1. **Abra *Auditoria*** — só administradores veem o item no menu, e a API recusa a leitura
   para os demais. O topo mostra eventos registrados, volume das últimas 24 horas, logins
   recusados na semana e usuários ativos.
2. **Entre e saia** — faça login, saia, e erre a senha de propósito uma vez. As três linhas
   aparecem, com IP. A tentativa recusada vem em vermelho e guarda o e-mail tentado, mesmo
   sem sessão.
3. **Faça uma ação de negócio** — registre um pagamento. A linha traz valor, data e forma no
   detalhe (clique na linha). Estorne: aparece a contrapartida.
4. **Exporte um relatório** — vira uma linha `Exportou dados` com o formato e os filtros. É o
   único evento em que o dado sai do sistema sem nada mudar no banco.
5. **Confirme que a trilha não pode ser alterada** — não há botão para isso na tela, e pela
   API:

   ```bash
   curl -i -X DELETE http://localhost:3333/api/audit-logs/<id> ^
     -H "Authorization: Bearer <token-de-admin>"
   ```

   Responde **404**: a rota não existe, nem para administrador.
6. **Exclua um cliente e volte à trilha** — a linha do que foi feito com ele continua lá,
   com o nome. Exclua um usuário: as linhas dele preservam o e-mail, mesmo sem a conta.
7. **Teste a força bruta** — erre a senha onze vezes seguidas:

   ```bash
   for /l %i in (1,1,11) do curl -s -o nul -w "%%{http_code} " ^
     -X POST http://localhost:3333/api/auth/login ^
     -H "Content-Type: application/json" ^
     -d "{\"email\":\"admin@proaccounting.com.br\",\"password\":\"errada\"}"
   ```

   Dez respondem 401 e a partir da décima primeira vem **429**, com a mensagem dizendo
   quantos segundos faltam. Todas as onze ficam na trilha.
8. **Confirme que a senha não vaza** — nenhuma resposta da API traz `password` nem hash
   bcrypt, e a trilha do reset de acesso não contém a senha provisória gerada.

---

## 9. Rotas da API

Prefixo: `/api`

### Infraestrutura e sessão

| Método | Rota           | Acesso        | Descrição                                     |
| ------ | -------------- | ------------- | --------------------------------------------- |
| `GET`  | `/health`      | Público       | Estado da API e conexão com o banco           |
| `POST` | `/auth/login`  | Público       | Autentica e devolve o token JWT               |
| `GET`  | `/auth/me`     | Autenticado   | Dados do usuário da sessão atual              |
| `GET`  | `/dashboard`   | Autenticado   | Indicadores, séries dos gráficos e alertas    |

### Clientes

| Método   | Rota                     | Acesso        | Descrição                                  |
| -------- | ------------------------ | ------------- | ------------------------------------------ |
| `GET`    | `/clients`               | Autenticado   | Lista paginada, com busca e filtros        |
| `GET`    | `/clients/:id`           | Autenticado   | Ficha do cliente, contratos e resumo       |
| `GET`    | `/clients/:id/history`   | Autenticado   | Histórico de alterações, paginado          |
| `GET`    | `/clients/:id/invoices`  | Autenticado   | Faturas do cliente, paginadas              |
| `POST`   | `/clients`               | Autenticado   | Cadastra um cliente                        |
| `PUT`    | `/clients/:id`           | Autenticado¹  | Atualiza o cadastro                        |
| `PATCH`  | `/clients/:id/status`    | **ADMIN**     | Ativa ou inativa                           |
| `DELETE` | `/clients/:id`           | **ADMIN**     | Exclui — recusado se houver histórico      |

¹ O funcionário pode editar apenas dados de contato e endereço. Nome, razão social,
CPF/CNPJ, Inscrição Estadual e situação são exclusivos do administrador. A lista está em
`EMPLOYEE_EDITABLE_FIELDS` (`backend/src/services/client.service.ts`) — é essa constante
que define a política, e a recusa diz exatamente qual campo foi barrado.

**Parâmetros de `GET /clients`:**

| Parâmetro  | Valores                                      | Padrão      |
| ---------- | -------------------------------------------- | ----------- |
| `search`   | nome, nome fantasia, e-mail ou CPF/CNPJ      | —           |
| `status`   | `ACTIVE`, `INACTIVE`                         | todos       |
| `state`    | UF com 2 letras                              | todas       |
| `city`     | busca parcial, sem diferenciar maiúsculas    | todas       |
| `sort`     | `name`, `createdAt`, `updatedAt`, `city`     | `createdAt` |
| `order`    | `asc`, `desc`                                | `desc`      |
| `page`     | inteiro ≥ 1                                  | `1`         |
| `pageSize` | 1 a 100                                      | `20`        |

**Parâmetros de `GET /clients/:id/invoices`:** `status` (`PENDING`, `PAID`, `OVERDUE`,
`CANCELLED`), `page`, `pageSize`.

> `OVERDUE` **não existe no banco.** É derivado: fatura pendente com vencimento no
> passado. Por isso o filtro `PENDING` exclui as vencidas — se não excluísse, a mesma
> fatura apareceria nos dois filtros. A derivação fica num módulo só
> (`backend/src/services/invoice-summary.service.ts`), usado pela ficha do cliente, pela
> ficha do contrato e pelo painel, para que nenhuma tela discorde de outra sobre quantas
> faturas estão atrasadas.

### Contratos

| Método   | Rota                       | Acesso        | Descrição                              |
| -------- | -------------------------- | ------------- | -------------------------------------- |
| `GET`    | `/contracts`               | Autenticado   | Lista paginada, com busca e filtros    |
| `GET`    | `/contracts/next-number`   | Autenticado   | Sugere o próximo número livre          |
| `GET`    | `/contracts/:id`           | Autenticado   | Ficha do contrato, cliente e financeiro |
| `GET`    | `/contracts/:id/invoices`  | Autenticado   | Faturas do contrato, paginadas         |
| `POST`   | `/contracts`               | Autenticado   | Cadastra um contrato                   |
| `PUT`    | `/contracts/:id`           | Autenticado¹  | Atualiza o contrato                    |
| `PATCH`  | `/contracts/:id/status`    | **ADMIN**     | Encerra, cancela ou reabre             |
| `POST`   | `/contracts/:id/renew`     | **ADMIN**     | Renova, com reajuste opcional          |
| `DELETE` | `/contracts/:id`           | **ADMIN**     | Exclui — recusado se houver faturas    |

¹ O funcionário edita os dados do contrato, mas **não a situação**. A checagem fica no
serviço e não na rota porque depende do conteúdo do corpo: sem ela haveria um buraco na
autorização — encerrar está protegido em `PATCH /:id/status`, mas o mesmo efeito seria
obtido mandando `status` no corpo do `PUT`.

**Parâmetros de `GET /contracts`:**

| Parâmetro        | Valores                                                          | Padrão      |
| ---------------- | ---------------------------------------------------------------- | ----------- |
| `search`         | número, tipo de serviço, nome/fantasia/CPF-CNPJ do cliente        | —           |
| `status`         | `ACTIVE`, `PENDING`, `RENEWAL`, `CLOSED`, `CANCELLED`             | todos       |
| `clientId`       | contratos de um cliente específico                                | todos       |
| `expiringInDays` | 1 a 365 — contratos que terminam nesse prazo                      | —           |
| `sort`           | `number`, `startDate`, `endDate`, `monthlyValue`, `createdAt`, `client` | `createdAt` |
| `order`          | `asc`, `desc`                                                     | `desc`      |
| `page`           | inteiro ≥ 1                                                       | `1`         |
| `pageSize`       | 1 a 100                                                           | `20`        |

> `expiringInDays` deixa de fora os contratos por prazo indeterminado (sem data de
> término, não há vencimento a antecipar) e os já encerrados ou cancelados, que saíram de
> operação. `sort=client` ordena pelo **nome do cliente**, não por uma coluna de
> `contracts`.

**Ações que não são CRUD:**

| Ação      | Efeito                                                                        |
| --------- | ----------------------------------------------------------------------------- |
| Encerrar  | `status: CLOSED`. Se o término era nulo ou futuro, registra **hoje** como fim  |
| Cancelar  | `status: CANCELLED`. **Não** altera datas — o contrato foi desfeito            |
| Renovar   | Estende o término no mesmo contrato, aplica reajuste e volta a `ACTIVE`        |

> **Por que renovar não cria um contrato novo.** As faturas apontam para `contract_id`.
> Partir a renovação em dois registros espalharia o histórico financeiro do mesmo acordo
> por dois contratos, e o "total faturado" da ficha zeraria a cada renovação — justamente
> na tela que existe para mostrar quanto aquele contrato já rendeu.

### Faturas

| Método   | Rota                                  | Acesso       | Descrição                        |
| -------- | ------------------------------------- | ------------ | -------------------------------- |
| `GET`    | `/invoices`                           | Autenticado  | Lista paginada, com filtros      |
| `GET`    | `/invoices/next-number`               | Autenticado  | Sugere o próximo número livre    |
| `GET`    | `/invoices/:id`                       | Autenticado  | Ficha da fatura                  |
| `GET`    | `/invoices/:id/history`               | Autenticado  | Auditoria, paginada              |
| `GET`    | `/invoices/:id/payments`              | Autenticado  | Pagamentos da fatura             |
| `POST`   | `/invoices`                           | Autenticado  | Emite uma fatura                 |
| `PUT`    | `/invoices/:id`                       | Autenticado  | Atualiza a fatura                |
| `POST`   | `/invoices/:id/payment`               | Autenticado  | Registra um pagamento            |
| `PATCH`  | `/invoices/:id/status`                | **ADMIN**    | Cancela ou reabre                |
| `DELETE` | `/invoices/:id/payments/:paymentId`   | **ADMIN**    | Estorna um pagamento             |
| `DELETE` | `/invoices/:id`                       | **ADMIN**    | Exclui — recusado se houver pagamento |

> **Registrar pagamento é liberado ao funcionário; estornar, não.** Registrar apenas
> ACRESCENTA informação, sempre com autor e data no histórico, e é a operação mais
> frequente do balcão. Estornar apaga dinheiro do sistema.

**A situação da fatura NÃO é um campo.** Nem na emissão, nem na edição: `status` é
recusado no corpo das duas rotas. Ela é consequência de três coisas que só o servidor
conhece, e a regra vive em `backend/src/utils/invoice-status.ts`:

| Condição                                    | Situação    | Onde é aplicada |
| ------------------------------------------- | ----------- | --------------- |
| Cancelada                                   | `CANCELLED` | escrita         |
| Pagamentos cobrem o valor de face           | `PAID`      | escrita         |
| Pendente e vencimento **antes** de hoje     | `OVERDUE`   | **leitura**     |
| Demais casos                                | `PENDING`   | leitura         |

> **`OVERDUE` nunca é gravado.** Uma fatura se torna atrasada pela passagem do tempo, sem
> ninguém agir sobre ela — se o status ficasse na coluna, estaria errado todos os dias até
> alguém rodar uma rotina de atualização, e bastaria essa rotina falhar num fim de semana
> para o escritório cobrar juros de quem está em dia. `PAID` é o oposto: pagamento é um
> evento com autor, data e valor, então é gravado na hora, dentro da mesma transação do
> lançamento. Nada disso é decidido no frontend; ele exibe o que a API devolve.

**Parâmetros de `GET /invoices`:**

| Parâmetro               | Valores                                                    | Padrão    |
| ----------------------- | ---------------------------------------------------------- | --------- |
| `search`                | número, descrição, contrato, nome/CPF-CNPJ do cliente      | —         |
| `clientId`, `contractId`| faturas de um cliente ou contrato                          | todas     |
| `status`                | `PENDING`, `PAID`, `OVERDUE`, `CANCELLED`                   | todas     |
| `issueFrom`, `issueTo`  | período de **emissão** (`YYYY-MM-DD`)                       | —         |
| `dueFrom`, `dueTo`      | período de **vencimento**                                   | —         |
| `minAmount`, `maxAmount`| faixa de valor                                              | —         |
| `sort`                  | `number`, `issueDate`, `dueDate`, `amount`, `createdAt`, `client` | `dueDate` |
| `order`                 | `asc`, `desc`                                               | `desc`    |
| `page` / `pageSize`     | inteiro ≥ 1 / 1 a 100                                       | `1` / `20` |

> Emissão e vencimento são períodos **separados** porque "o que emitimos em março" e "o
> que vence em março" são perguntas diferentes. O filtro `PENDING` exclui as vencidas —
> se não excluísse, a mesma fatura apareceria em dois filtros.

### Pagamentos

| Método   | Rota                                | Acesso       | Descrição                           |
| -------- | ----------------------------------- | ------------ | ----------------------------------- |
| `GET`    | `/payments`                         | Autenticado  | Histórico de caixa, paginado        |
| `GET`    | `/payments/:id`                     | Autenticado  | Um pagamento, com contexto da fatura |
| `POST`   | `/invoices/:id/payment`             | Autenticado  | Registra um pagamento               |
| `DELETE` | `/invoices/:id/payments/:paymentId` | **ADMIN**    | Estorna um pagamento                |

> **O módulo de pagamentos é de leitura.** Um pagamento nasce sempre vinculado a uma
> fatura e é desfeito por estorno nela. Não existe criação avulsa: dinheiro sem cobrança
> vinculada seria um lançamento que ninguém consegue explicar depois.
>
> `POST /invoices/:id/payment` (singular) e `/payments` (plural) atendem ao mesmo handler
> — a primeira é a rota da ação, a segunda mantém a convenção REST da coleção que o `GET`
> já usa.

**Corpo de `POST /invoices/:id/payment`:** `amount`, `paymentDate`, `paymentMethod`
(`PIX`, `BOLETO`, `TRANSFER`, `CASH`, `CARD`, `OTHER`), `notes` e `confirmDuplicate`.

**Parâmetros de `GET /payments`:** `search` (fatura, cliente ou observação), `clientId`,
`invoiceId`, `contractId`, `paymentMethod`, `registeredBy`, `dateFrom`/`dateTo`,
`minAmount`/`maxAmount`, `sort` (`paymentDate`, `amount`, `createdAt`, `client`), `order`,
`page`, `pageSize`.

> A resposta traz `totalAmount`: a soma de **todos** os pagamentos que atendem ao filtro,
> não apenas os da página. É a pergunta que a tela existe para responder — "quanto entrou
> neste período" — e somar só a página daria a resposta errada a partir do 21º lançamento.

**Regras do lançamento:**

| Situação                                              | Resposta |
| ----------------------------------------------------- | -------- |
| Valor negativo ou zero                                 | `422`    |
| Valor acima do saldo em aberto                         | `422`    |
| Fatura cancelada                                       | `409`    |
| Fatura já quitada                                      | `409`    |
| Mesma fatura, valor, data e forma de um lançamento existente | `409` — liberado com `confirmDuplicate` |

> **Duplicata acidental.** Mesma fatura, mesmo valor, mesma data e mesma forma é quase
> sempre o mesmo dinheiro lançado duas vezes — duplo clique, página reaberta, duas pessoas
> conferindo o extrato ao mesmo tempo. O estrago é silencioso: a fatura aparece quitada e a
> diferença só surge na conciliação bancária semanas depois. Não é uma trava absoluta
> porque a coincidência acontece (duas parcelas iguais pagas no mesmo PIX), então
> `confirmDuplicate` existe — a API só se recusa a decidir isso sozinha.

### Financeiro — **somente ADMIN**

| Método | Rota                 | Acesso    | Descrição                                   |
| ------ | -------------------- | --------- | ------------------------------------------- |
| `GET`  | `/finance/overview`  | **ADMIN** | Cards, séries dos gráficos e período resolvido |
| `GET`  | `/finance/entries`   | **ADMIN** | Faturas do período, paginadas               |
| `GET`  | `/finance/export`    | **ADMIN** | Exportação do período (CSV)                 |

> **Por que só o administrador.** A diferença em relação aos outros módulos é o RECORTE,
> não o dado: o funcionário já vê o financeiro de um cliente na ficha dele e o de um
> contrato na ficha do contrato — informação de que precisa para atender. O que ele não vê
> é o consolidado do escritório. O item some do menu e o guard de rota barra a navegação,
> mas os dois rodam no navegador; `authorize('ADMIN')` na API é o que não dá para burlar.

**Períodos.** `period` aceita `today`, `week`, `month`, `previous-month`, `year` e
`custom` (com `from` e `to`). Quem traduz o nome em intervalo é o **servidor**: "este mês"
depende do fuso do escritório, e um usuário com o relógio errado veria um recorte
diferente do colega olhando o mesmo sistema. `week` é a semana corrente a partir da
**segunda-feira**, não os últimos sete dias.

**O que segue o período e o que não segue:**

| Card                                  | Recorte                                  |
| ------------------------------------- | ---------------------------------------- |
| Total recebido, Total faturado        | o período selecionado                    |
| Receita do mês, Receita do ano        | mês e ano correntes, sempre              |
| Total pendente, Total atrasado        | **posição de hoje**, todas as faturas    |

> Pendente e atrasado são saldos, não fluxo. "Atrasado" quer dizer "vencido até hoje e não
> pago"; recortar por período responderia outra pergunta — "o que venceu naquele intervalo
> e continua em aberto". A tela diz isso abaixo dos cards, porque somar um card de fluxo
> com um de saldo é o erro de leitura mais provável de um painel financeiro.

**Granularidade.** A série de receita agrupa por **dia** em períodos de até 62 dias e por
**mês** acima disso. A decisão é do servidor, junto com os rótulos do eixo — se o
frontend escolhesse por conta própria, um período de 70 dias renderia barras diárias com
rótulos mensais.

**Exportação.** `format` aceita `csv`, `xlsx` e `pdf`; só o CSV está implementado, e os
outros dois respondem **501** dizendo qual formato já funciona. A montagem das linhas é
separada da serialização (`buildExportRows` devolve uma matriz neutra), então acrescentar
Excel ou PDF é escrever um segundo serializador sem tocar em consulta nem em regra.

> O CSV sai com **ponto e vírgula** e **BOM UTF-8**, para abrir corretamente no Excel em
> português: com vírgula como separador toda linha com dinheiro quebraria, e sem o BOM
> "João" viraria "JoÃ£o". Os valores usam vírgula decimal pelo mesmo motivo. Há teto de
> 5.000 linhas por exportação.

### Notificações

| Método  | Rota                          | Acesso      | Descrição                        |
| ------- | ----------------------------- | ----------- | -------------------------------- |
| `GET`   | `/notifications`              | Autenticado | Caixa do usuário, paginada       |
| `PATCH` | `/notifications/:id/read`     | Autenticado | Marca uma como lida              |
| `PATCH` | `/notifications/read-all`     | Autenticado | Marca todas as do usuário        |

**Parâmetros de `GET /notifications`:** `status` (`all`, `unread`, `read`), `page`,
`pageSize`. A resposta traz `unreadCount` — o número do selo do sino, sempre o total de
não lidas do usuário, independente do filtro aplicado.

> Nenhuma rota aceita um `userId` vindo do cliente. O recorte é sempre o usuário da
> sessão; uma notificação de outra pessoa responde **404**, não 403 — um 403 confirmaria
> que o id existe e deixaria alguém sondar a caixa alheia.

**Os três tipos gerados hoje:**

| Tipo                | Condição                                      | Urgência   |
| ------------------- | --------------------------------------------- | ---------- |
| `INVOICE_OVERDUE`   | fatura pendente com vencimento no passado     | `CRITICAL` |
| `INVOICE_DUE_SOON`  | fatura pendente vencendo em até 7 dias        | `WARNING` no dia, `INFO` antes |
| `CONTRACT_EXPIRING` | contrato ativo terminando em até 30 dias      | `WARNING` na última semana, `INFO` antes |

> As janelas (7 e 30 dias) são as **mesmas constantes** usadas pelos alertas do painel
> (`CONTRACT_EXPIRY_WINDOW_DAYS` e `INVOICE_DUE_SOON_WINDOW_DAYS`, em `utils/date.ts`).
> Duas definições divergiriam, e o sino passaria a discordar do painel na mesma tela.

**Como as notificações nascem — e somem.** Não há gatilho de evento. Uma varredura
idempotente compara "o que deveria estar avisado" com "o que está" e acerta os dois lados.
O motivo é o mesmo que faz `OVERDUE` não ser gravado nas faturas: uma fatura fica atrasada
pela passagem do tempo, sem ninguém agir — um gatilho nunca dispararia, porque evento
nenhum aconteceu.

Remover é tão importante quanto criar: um aviso de "fatura atrasada" de uma fatura já paga
é ruído que ensina o usuário a ignorar o sino. A lista é uma fila de pendências, não um
registro histórico — para histórico existe a aba de auditoria da fatura.

**Deduplicação.** A chave é `<tipo>:<id da entidade>:<id do usuário>`, com índice **único**
no banco. É o banco que garante a ausência de duplicatas, não a lógica da varredura: duas
execuções simultâneas não conseguem criar o mesmo alerta duas vezes.

**Frequência.** A varredura roda no máximo uma vez por minuto durante o polling do sino.
Mas toda escrita que afeta alerta — pagamento, cancelamento, mudança de vencimento,
renovação de contrato — chama `requestResweep()` e zera esse relógio, para que o aviso
suma no instante em que a fatura é paga, e não até um minuto depois.

**Estado de leitura por usuário.** Cada notificação é uma linha por destinatário. Com uma
linha compartilhada, o funcionário que abrisse o sino marcaria o alerta como lido e o
administrador nunca o veria. O custo é a multiplicação de linhas — dezenas, num escritório
contábil — e o ganho é que cada linha já tem um **destinatário**, que é exatamente o que um
canal de e-mail ou WhatsApp precisa saber.

**Preparado para outros canais.** `services/notification-channels.ts` define a interface
`NotificationChannel` e a lista de canais registrados; hoje só o `IN_APP`. Acrescentar
e-mail, WhatsApp ou push é escrever uma implementação e incluí-la na lista — nada em quem
decide *quais* notificações existem precisa mudar. A coluna `delivered_channels` registra
por onde cada uma já saiu, o que impede reenvio a cada varredura; falha de canal é
registrada e engolida, porque o e-mail não sair não pode impedir o alerta de aparecer no
sino.

### Usuários e permissões — **somente ADMIN**, exceto a troca da própria senha

| Método   | Rota                        | Acesso      | Descrição                              |
| -------- | --------------------------- | ----------- | -------------------------------------- |
| `GET`    | `/users`                    | ADMIN       | Lista com busca, filtros e paginação   |
| `GET`    | `/users/:id`                | ADMIN       | Detalhe                                |
| `POST`   | `/users`                    | ADMIN       | Cadastra                               |
| `PUT`    | `/users/:id`                | ADMIN       | Altera nome e e-mail                   |
| `PATCH`  | `/users/:id/role`           | ADMIN       | Troca o perfil                         |
| `PATCH`  | `/users/:id/status`         | ADMIN       | Ativa / inativa                        |
| `POST`   | `/users/:id/reset-password` | ADMIN       | Gera senha provisória de uso único     |
| `DELETE` | `/users/:id`                | ADMIN       | Exclui — só sem histórico vinculado    |
| `POST`   | `/users/me/password`        | Autenticado | Troca a **própria** senha              |

**Parâmetros de `GET /users`:** `search` (nome ou e-mail), `role` (`ADMIN`, `EMPLOYEE`),
`status` (`active`, `inactive`), `sort` (`name`, `email`, `role`, `createdAt`), `order`,
`page`, `pageSize`.

> **A senha nunca sai pela API.** Toda consulta do módulo usa a constante `USER_SELECT`,
> que não inclui o campo. Não existe um `findMany` sem `select` no módulo, então não há
> como esquecer de excluí-lo — e é justamente o padrão do Prisma, que devolve a linha
> inteira, que produz vazamento de hash em código escrito às pressas. Quando o hash é
> necessário (login e troca de senha), a consulta o pede explicitamente, isolada, e o
> descarta em seguida.

**A interface não é a barreira.** O menu esconde o item para funcionários e o guard de
rota redireciona, mas as duas coisas são conveniência visual. Quem chamar
`DELETE /api/users/<id>` com o token de um funcionário — por `curl`, Postman ou pelo
console do navegador — recebe **403** no `preHandler`, antes de qualquer consulta ao banco.

**Portas dos fundos fechadas.** `PUT /users/:id` aceita apenas nome e e-mail: `role`,
`active` e `password` no corpo são descartados pelo schema. Sem isso, a edição de cadastro
seria o caminho para se promover a administrador sem passar pela rota que verifica as
travas — o mesmo tipo de brecha já fechada em clientes e faturas.

**O administrador não se derruba.** Nenhum administrador pode rebaixar, desativar, excluir
ou resetar a **própria** conta. O motivo é que este é o único módulo em que o erro é
irreversível pela interface: quem se rebaixa a funcionário perde, no mesmo clique, a
permissão de se promover de volta, e o conserto passa a ser um `UPDATE` manual no banco.

Além disso, toda troca de perfil, inativação e exclusão roda dentro de uma transação que
**conta os administradores ativos depois da escrita** e a desfaz se o total chegar a zero.
A verificação é posterior de propósito: uma checagem prévia do tipo "o alvo é o último
administrador?" nunca dispararia, porque quem chama já é, obrigatoriamente, um
administrador ativo diferente do alvo — seria código morto se disfarçando de rede de
proteção. Verificando depois, a condição coberta é a que interessa ("sobrou alguém?"), o
que também pega dois administradores se rebaixando ao mesmo tempo.

**Reset de acesso.** O sistema gera a senha, o administrador não a escolhe — senão as
senhas provisórias seriam sempre a mesma, fraca e reaproveitada. Ela usa um alfabeto sem
caracteres ambíguos (`0/O`, `1/l/I`, `5/S`), em blocos de quatro, porque vai ser ditada por
telefone. Aparece **uma única vez** na resposta: não é gravada em texto puro, não vai para
log e não há rota que a recupere — perdida, refaz-se o reset. A conta fica marcada com
`mustChangePassword`, e a aplicação cobra a troca no acesso seguinte.

**Tokens antigos deixam de valer.** Resetar o acesso, desativar a conta e trocar a senha
gravam `passwordChangedAt`; o middleware recusa todo token assinado antes desse instante.
Sem isso, um reset feito justamente porque a conta foi comprometida deixaria a sessão do
invasor viva por até um dia. Por isso `POST /users/me/password` devolve um **token novo**:
quem troca a própria senha derruba as outras sessões da conta, não a sua.

> A comparação tolera um segundo. O claim `iat` do JWT tem granularidade de segundos e
> `passwordChangedAt` é gravado em milissegundos — sem truncar, a troca de senha
> invalidaria o token que ela mesma acabou de emitir.

**Exclusão é estreita de propósito.** Um usuário que registrou pagamentos ou alterou
cadastros não pode ser excluído: o pagamento guarda "quem registrou" como exigência de
auditoria, e o banco reforça com `onDelete: Restrict`. A API verifica antes e responde
**409** explicando quantos registros existem e sugerindo inativar; sem essa checagem o
pedido morreria numa violação de chave estrangeira e o administrador leria um erro interno.
Na prática, excluir só serve para desfazer um cadastro recém-criado por engano.

### Relatórios

| Método | Rota                    | Acesso      | Descrição                                |
| ------ | ----------------------- | ----------- | ---------------------------------------- |
| `GET`  | `/reports`              | Autenticado | Catálogo, filtrado pelo perfil           |
| `GET`  | `/reports/:id`          | Autenticado | Dados do relatório, paginados            |
| `GET`  | `/reports/:id/export`   | Autenticado | Arquivo em `csv`, `xlsx` ou `pdf`        |

**Três rotas para quinze relatórios.** Acrescentar um relatório é escrever um objeto de
definição em `reports/definitions/` e incluí-lo no array do grupo — nada de rota,
controller, validador, exportador ou tela nova. A interface também não conhece nenhum
relatório: ela lê o catálogo, desenha os filtros que a definição declara aceitar e monta a
tabela a partir das colunas que vieram com os dados.

**Parâmetros de `/reports/:id`:** `from`, `to` (datas `AAAA-MM-DD`), `clientId`, `status`,
`page`, `pageSize`. O `export` troca a paginação por `format`.

**Os quinze relatórios:**

| Grupo        | Relatórios                                                     | Acesso |
| ------------ | -------------------------------------------------------------- | ------ |
| Clientes     | ativos, inativos, novos por período                            | todos  |
| Contratos    | ativos, encerrados, cancelados, vencendo                       | todos  |
| Faturas      | pagas, pendentes, atrasadas, canceladas                        | todos  |
| Financeiro   | faturamento, recebimentos, pendências, atrasos                 | **ADMIN** |

> **Por que Faturas e Financeiro não são o mesmo grupo.** Um relatório de faturas responde
> "em que situação está esta cobrança" — rotina de atendimento. Um relatório financeiro
> responde "quanto o escritório faturou, recebeu e tem a receber" — informação de gestão.
> É o mesmo critério que já separava o financeiro por cliente (que o funcionário vê) do
> consolidado do escritório (que ele não vê).

**Onde a permissão é checada.** No SERVIÇO, não no `preHandler`. As três rotas são as
mesmas para os quinze relatórios, então a rota não tem como saber se o `:id` que chegou é
restrito — só o catálogo sabe. Pôr `authorize('ADMIN')` nelas trancaria junto os
relatórios de clientes e contratos, que o funcionário precisa usar. O efeito para quem
tenta burlar é o mesmo: `/api/reports/finance-overdue` com token de funcionário devolve
**403** antes de qualquer consulta ao banco. O catálogo, além disso, nem lista os
financeiros para ele — mas isso é conveniência de tela, não a barreira.

**Cada relatório declara sobre QUAL data o período incide** (`periodField`), e o texto
aparece na tela e no cabeçalho do arquivo. Sem isso, "de 01/09 a 30/09" é ambíguo:
emitidas em setembro? vencendo em setembro? pagas em setembro? O número deixaria de ser
conferível.

**Todo arquivo exportado carrega o contexto** — título, período, cliente, situação e data
de emissão — impresso antes dos dados. Um arquivo encontrado meses depois na pasta de
downloads precisa dizer de onde veio; quem o recebe por e-mail não tem o filtro na tela
para consultar.

**Teto de 5.000 linhas por exportação.** Acima disso a resposta é 422 pedindo para
estreitar o recorte. Sem limite, exportar "todo o período" de um escritório grande montaria
o arquivo inteiro em memória e seguraria a conexão do banco enquanto isso.

#### Os três formatos, e por que foram escritos à mão

`reports/formatters/` gera CSV, XLSX e PDF **sem nenhuma dependência nova**.

- **CSV** — separador `;` e BOM UTF-8, que é o que faz o arquivo abrir certo no Excel
  brasileiro. Implementação única no projeto: o módulo financeiro passou a usar esta, em
  vez da cópia que mantinha.
- **XLSX** — um `.xlsx` é um ZIP com meia dúzia de XMLs. O ZIP é montado em
  `formatters/zip.ts` (CRC-32 e `deflate` do próprio Node). O ganho sobre o CSV é
  decisivo: os valores vão como **número**, então a coluna soma. No CSV eles são texto,
  alinham à esquerda e somem de qualquer fórmula. A planilha já vem com filtro no
  cabeçalho e o cabeçalho congelado.
- **PDF** — tabela paginada, cabeçalho repetido em cada página, "página X de Y". Usa
  Helvetica, uma das fontes padrão que todo leitor de PDF já tem, então nada precisa ser
  embutido. O texto é convertido para **WinAnsi (CP1252)**, não para `latin1`: as duas
  codificações coincidem nos acentos do português, mas divergem no travessão, nas aspas
  curvas e nas reticências — e `latin1` transformaria "—" num caractere de controle.

> **A decisão de não usar `exceljs` e `pdfkit`** foi tomada porque precisamos de uma fração
> do que elas fazem: tabelas simples, sem gráfico, imagem ou fonte personalizada. O custo
> seria alguns megabytes de dependência e uma superfície de atualização a manter por anos.
> **Quando trocar:** se os relatórios passarem a exigir várias abas com referências entre
> si, gráficos embutidos ou formatação condicional. Aí a conta se inverte — e a troca
> mexe só em `formatters/`, porque nada fora dali sabe o que é um ZIP ou um `xref`.

### Configurações

| Método | Rota                     | Acesso      | Descrição                                |
| ------ | ------------------------ | ----------- | ---------------------------------------- |
| `GET`  | `/settings`              | Autenticado | Configuração e as listas aceitas         |
| `PUT`  | `/settings/company`      | **ADMIN**   | Dados da empresa                         |
| `PUT`  | `/settings/appearance`   | **ADMIN**   | Logotipo e cores                         |
| `PUT`  | `/settings/general`      | **ADMIN**   | Antecedência, moeda, fuso, formato       |
| `PUT`  | `/users/me`              | Autenticado | Nome e e-mail do **próprio** cadastro    |
| `POST` | `/users/me/password`     | Autenticado | Troca da **própria** senha               |

**Ler é de todos, escrever é do administrador.** A leitura tem de ser aberta porque a
interface inteira depende dela para se desenhar — logotipo, cores, nome da empresa.
Restringi-la faria o sistema aparecer sem marca para o funcionário. Nada ali é sigiloso: é
o nome da empresa e o endereço que já sai no rodapé de qualquer documento emitido.

**Uma tabela de UMA linha**, de id fixo `singleton`. Todo acesso é `upsert` nesse id, o que
resolve dois problemas de uma vez: a linha nasce sozinha na primeira leitura (sem precisar
de seed) e duas gravações simultâneas não conseguem criar configurações concorrentes.

Por que uma tabela e não o `.env`: estes valores são alterados pelo próprio usuário, pela
interface, sem reiniciar o servidor. O `.env` continua com o que é de infraestrutura —
banco, segredo do JWT.

#### O que realmente muda ao salvar

| Campo                     | Efeito                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| Antecedência de vencimento | **Imediato.** Muda quais faturas o painel e o sino consideram "vencendo" |
| Fuso horário              | **Imediato.** Muda o que o servidor entende por "hoje" em todo cálculo de atraso |
| Logotipo e cores          | **Imediato.** Aplicados ao sistema inteiro                             |
| Moeda e formato de data   | **Guardados.** A exibição continua em Real e dia/mês/ano               |

As duas últimas ficam guardadas de propósito — a etapa pedia a estrutura preparada, e é o
que está feito. A própria tela avisa isso ao usuário, em vez de deixá-lo salvar e concluir
que o campo está com defeito.

**Cache em memória, não consulta por chamada.** `today()` é chamada dezenas de vezes por
requisição, em código síncrono espalhado por todos os módulos; torná-la assíncrona para ler
o banco contaminaria a assinatura de metade do sistema para buscar um valor que muda uma
vez por ano. A configuração é carregada na subida (antes de a porta abrir) e o cache é
refrescado em toda escrita. A antecedência é lida por uma **função**, não por uma constante
importada: uma constante ficaria congelada no import e continuaria valendo 7 depois de o
administrador mudar para 15 — bug que só apareceria no próximo reinício.

Toda escrita de configuração também chama `requestResweep()`, pelo mesmo motivo que
pagamento e estorno chamam: a varredura de notificações roda no máximo uma vez por minuto,
e sem zerar esse relógio o sino continuaria com a janela antiga por até 60 segundos.

#### Identidade visual

**As cores aplicam de verdade, não só em um botão.** As classes `brand-50` … `brand-950`
estão em dezenas de componentes e, no Tailwind, viram hexadecimais fixos no CSS compilado —
uma cor escolhida no banco não teria como alcançá-las. A rampa passou a ser declarada como
`hsl(var(--brand-600))`, e `src/lib/theme.ts` escreve essas variáveis no `<html>`. As
classes são as mesmas em todos os componentes; o que muda é o valor por trás delas.
Nenhuma tela precisou ser reescrita.

Da cor escolhida o sistema **deriva a rampa inteira** de onze tons. O degrau 600 é
exatamente a cor escolhida — matiz, saturação e luminosidade — porque `bg-brand-600` e o
botão (que usa o token `--primary`) precisam mostrar o mesmo tom. Os outros degraus são
interpolados entre ela e as pontas da escala, o que garante que `brand-50` sirva de fundo
claro e `brand-900` de fundo do menu lateral qualquer que seja a cor.

A tela mostra a rampa inteira e **avisa quando o contraste com texto branco fica abaixo de
4,5:1**. O aviso não impede de salvar — a decisão é de quem opera o sistema —, mas ninguém
deveria descobrir o problema quando um cliente reclamar que não consegue ler o botão.

> **O que NÃO é configurável, de propósito:** as cores de estado (verde para pago, âmbar
> para pendente, vermelho para atrasado). Elas passaram por validação de contraste e de
> distinção sob daltonismo, e são semânticas — vermelho significa atraso em qualquer
> identidade visual. Deixar o usuário pintá-las destruiria as duas coisas.

**O logotipo é guardado no banco como data URL**, não em arquivo. É UM arquivo pequeno de
uma linha única: gravá-lo ali dispensa diretório de upload, rota de arquivo estático,
backup separado e limpeza de órfãos. Limite de 400 KB, com PNG, JPEG, WEBP ou SVG aceitos.
O SVG é renderizado só via `<img>`, contexto em que o navegador não executa script embutido
no arquivo. Se um dia houver upload de documento por cliente, aí sim vale um storage de
verdade.

#### Perfil e senha

Trocar o **nome** não pede nada. Trocar o **e-mail** exige a senha atual, porque o e-mail é
a credencial de login: um notebook destravado por dois minutos bastaria para alguém apontar
a conta para um endereço próprio e, de lá, pedir um reset de acesso.

A sessão **não** é invalidada ao trocar nome ou e-mail, e isso é deliberado: nenhum dos dois
autoriza coisa alguma, e o middleware relê o usuário do banco a cada requisição. Quem
invalida sessão são as três operações que mexem em credencial — troca de senha, reset de
acesso e desativação de conta.

A troca de senha reaproveita `POST /users/me/password` da etapa de usuários: mesma política
de força, mesma invalidação de token anterior, mesma emissão de token novo. Reimplementá-la
aqui criaria duas políticas de senha no mesmo sistema, e uma delas ficaria para trás na
primeira mudança de regra.

### Auditoria

| Método | Rota           | Acesso    | Descrição                                   |
| ------ | -------------- | --------- | ------------------------------------------- |
| `GET`  | `/audit-logs`  | **ADMIN** | Trilha paginada, com filtros e resumo       |
| `POST` | `/auth/logout` | Autenticado | Registra a saída na trilha                |

**Não existe rota de escrita, edição ou exclusão da trilha, e a ausência é o ponto.** Um
`POST /audit-logs` permitiria forjar linhas; um `DELETE` permitiria apagar as próprias — as
duas coisas que uma trilha de auditoria existe para impedir. Ela é preenchida pelos próprios
serviços de negócio, no instante em que a ação acontece.

**Parâmetros:** `action`, `entity`, `userId`, `search` (nome, e-mail, registro ou IP),
`from`, `to`, `page`, `pageSize`.

**O que cada linha guarda:** usuário (id, nome e e-mail), ação, entidade, id e identificação
legível do registro, IP, navegador, dados relevantes da alteração e o instante.

#### Diferença entre a trilha e o histórico de cliente/fatura

Os dois coexistem porque respondem a perguntas diferentes:

- `client_history` e `invoice_history` são o histórico de **negócio** de um registro,
  exibido na ficha dele, campo a campo com valor anterior e novo.
- `audit_logs` é o registro de **segurança** do sistema inteiro: inclui login, logout,
  tentativa recusada, exportação de dados e alteração de configuração — coisas que não
  pertencem à ficha de nenhum cliente.

"o que mudou nesta fatura" contra "o que esta pessoa andou fazendo no sistema".

#### Decisões que valem entender

**O nome e o e-mail do autor são COPIADOS para a linha**, além da chave estrangeira. Não é
redundância: `user_id` é `SetNull`, então excluir um usuário deixaria todas as linhas dele
anônimas. Uma trilha que perde o "quem" ao remover a conta não serve para nada — e é
justamente a conta de quem fez algo errado que alguém tentaria apagar.

**Registrar nunca derruba a operação.** Uma falha ao gravar a trilha é registrada no log do
processo e engolida. A alternativa — abortar o pagamento porque a auditoria falhou — faria
desta tabela um ponto único de falha do sistema. Para um escritório de contabilidade, perder
uma linha de trilha é menos grave que recusar um recebimento. **É uma escolha, não um
descuido:** havendo exigência regulatória de não-repúdio, a gravação precisa passar para
dentro da mesma transação da operação auditada.

**Senha nunca entra na trilha.** O `metadata` passa por um sanitizador que remove, em
qualquer nível do objeto, as chaves de senha, token e segredo — e o logotipo, que não é
secreto mas é um data URL de centenas de kilobytes. É rede de proteção: quem chama já não
manda senha, mas um dia alguém repassa o corpo inteiro da requisição sem pensar.

**Login recusado é ação própria** (`LOGIN_FAILED`), não um login com marca de falha. É o que
permite contar tentativas por conta e por IP — o sinal de força bruta. O motivo fica no
`metadata`; a RESPOSTA ao cliente continua idêntica para e-mail inexistente e senha errada,
senão o login vira um verificador de quais e-mails existem.

**Exportar dados é registrado** (`EXPORT`). É o único evento em que o dado sai do sistema
sem que nada mude no banco — sem essa linha, uma extração da carteira inteira de clientes
não deixaria rastro nenhum.

**Logout existe como rota** só para alimentar a trilha: o token é sem estado, e quem encerra
a sessão de fato é o navegador apagando o que guardou. Sem a rota, a auditoria mostraria
entradas e nenhuma saída.

**Envelope das respostas** (exceto `/health`, que é rota de probe e responde o objeto cru):

```jsonc
// sucesso
{ "success": true, "data": { } }

// erro
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "...", "issues": [] } }
```

Códigos de erro: `VALIDATION_ERROR` (422), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `TOO_MANY_REQUESTS` (429), `INTERNAL_ERROR` (500).

---

## 10. Modelo de dados

```text
User ─────────────┐
                  │ registra
                  ▼
Client ──< Contract ──< Invoice ──< Payment
   │                       ▲
   └───────────────────────┘
        (fatura avulsa, sem contrato)
```

| Tabela           | Papel                                                               |
| ---------------- | ------------------------------------------------------------------- |
| `users`          | Acesso ao sistema. Perfis `ADMIN` e `EMPLOYEE`, senha provisória e carimbo da última troca |
| `clients`        | Clientes do escritório. Situação `ACTIVE` / `INACTIVE`              |
| `client_history` | Auditoria do cadastro: o que mudou, quando e por quem               |
| `contracts`      | Contratos por cliente, com valor mensal e dia de vencimento         |
| `invoices`       | Faturas. Vinculadas a um cliente e, opcionalmente, a um contrato     |
| `invoice_history`| Auditoria da fatura: alterações, cancelamentos, pagamentos e estornos |
| `payments`       | Pagamentos de uma fatura, com registro de quem lançou               |
| `notifications`  | Alertas internos, um por usuário, com estado de leitura             |
| `settings`       | Configuração do sistema — **uma linha**, de id fixo `singleton`     |
| `audit_logs`     | Trilha de auditoria do sistema — append-only, nunca alterada        |

**Decisões que valem entender:**

- **`onDelete: Restrict`** entre cliente → contrato → fatura. Um sistema contábil não pode perder histórico financeiro porque alguém excluiu um cliente. Para tirar um cliente de operação, use a inativação (`status: INACTIVE`), não exclusão.
- **`Decimal(12,2)` para dinheiro**, nunca `Float`. Ponto flutuante produz erro de centavo.
- **`@db.Date` para datas de calendário** (emissão, vencimento). Sem hora e sem fuso: "vence dia 10" não pode virar dia 9 às 21h no horário de Brasília.
- **`contractId` é opcional na fatura** — o escritório também emite faturas avulsas, sem contrato.
- **CPF/CNPJ, telefone e CEP são gravados só com dígitos.** A máscara é aplicada na interface. Guardar formatado quebraria a busca e a unicidade.
- **O endereço é desmembrado** em CEP, rua, número, complemento, bairro, cidade e UF, em vez de um campo único de texto. Emissão fiscal exige os campos separados, e só assim é possível filtrar clientes por cidade ou UF.
- **Inscrição Estadual é texto livre**, não número: o formato varia por UF e `ISENTO` é um valor legítimo, comum em prestadores de serviço.
- **Encerrar e cancelar um contrato não são a mesma coisa.** Encerrado é um contrato que chegou ao fim e cumpriu o que foi acordado; cancelado foi desfeito. Por isso o encerramento registra a data em que a prestação acabou, e o cancelamento não mexe nas datas. Só isso permite responder "quanto faturamos com contratos cumpridos" separando de "o que foi desfeito".
- **A exclusão de contrato é barrada pela API, não pelo banco.** Diferente de cliente → contrato, a relação `invoices.contract_id` é `onDelete: SetNull`: apagar o contrato deixaria as faturas órfãs em silêncio, em vez de recusar. A checagem em `deleteContract` é a única barreira, e por isso ela não pode ser removida "porque o banco já protege".
- **A exclusão de fatura tem o mesmo problema, e é pior.** `payments.invoice_id` é `onDelete: Cascade`: apagar a fatura levaria os pagamentos junto, em silêncio — dinheiro recebido sumiria sem deixar rastro. A checagem em `deleteInvoice` é a única coisa que impede isso. O caminho correto é **cancelar**, que tira a fatura do faturamento e preserva documento e histórico.
- **Cancelar uma fatura com pagamento é recusado.** A fatura sairia do faturamento enquanto o pagamento continuaria lançado, e os dois números deixariam de fechar. Quem precisa desfazer uma cobrança já paga estorna o pagamento primeiro — e o estorno fica no histórico, que é a diferença entre corrigir e encobrir.
- **Pagamento acima do saldo em aberto é recusado.** A causa mais provável é um zero a mais na digitação. Aceitar criaria saldo negativo, que o sistema não tem como representar nem cobrar de volta.
- **Pagamento parcial é a regra, não a exceção.** Cada pagamento é uma linha própria em `payments`, e a fatura só vira `PAID` quando a soma cobre o valor de face. Não existe campo "valor pago" na fatura: ele é derivado dos lançamentos, o que permite três parcelas com formas e datas diferentes sem nenhuma alteração de modelo.
- **O histórico grava o valor anterior e o novo, campo a campo**, e apenas do que realmente mudou. O formulário reenvia todos os campos a cada gravação; sem esse filtro, corrigir um telefone geraria uma dúzia de linhas dizendo "mudou de X para X" e a auditoria ficaria ilegível em duas semanas.
- **Ativar e inativar viram eventos próprios** no histórico, não uma alteração genérica de campo — a decisão de tirar um cliente de operação precisa saltar aos olhos no meio das trocas de telefone e CEP.
- **`password_changed_at` existe para revogar token, não para curiosidade.** O JWT é sem estado: sem esse carimbo, desativar uma conta ou resetar o acesso só teria efeito quando o token expirasse — até um dia depois. Com ele, o middleware recusa qualquer token assinado antes da última troca, e o corte é imediato.
- **`must_change_password` impede que uma senha conhecida vire permanente.** Toda senha definida por outra pessoa — a inicial do cadastro e a provisória do reset — nasce marcada. Enquanto a marca existir, o sistema cobra a troca. Sem isso, o administrador ficaria sabendo indefinidamente a senha de contas alheias, e o "quem registrou este pagamento" dos recebimentos deixaria de identificar alguém.
- **A trilha de auditoria copia o nome e o e-mail do autor.** A chave estrangeira é `SetNull`, então excluir um usuário anonimizaria todas as linhas dele — e é justamente a conta de quem fez algo errado que alguém tentaria apagar. A cópia é o que faz a trilha sobreviver à remoção da conta.
- **`audit_logs.metadata` é JSON, não colunas fixas.** O formato do "que mudou" varia por ação; colunas fixas obrigariam a migrar a tabela a cada ação nova. O custo é não poder indexar o conteúdo — aceitável, porque a consulta real é sempre por autor, ação, entidade ou período, e todos têm índice.
- **A configuração é uma tabela de uma linha, com id fixo.** Não é gosto por simetria: com id gerado, duas gravações simultâneas criariam duas linhas e o sistema passaria a ler ora uma, ora outra. A chave fixa torna isso impossível, e o `upsert` cria a linha na primeira leitura — sem seed, sem migração de dados.
- **O logotipo mora no banco, não no disco.** Um arquivo pequeno, de uma linha única, gravado como data URL dispensa diretório de upload, rota de estático, backup separado e limpeza de órfãos. Vale enquanto for UM logotipo; upload por cliente exigiria storage de verdade.
- **Excluir usuário é barrado pela API, com o banco como segunda linha.** `payments.registered_by` é `onDelete: Restrict`, então o banco recusaria — mas com uma violação de chave estrangeira, que chega à tela como erro interno. A checagem em `deleteUser` existe para transformar isso em "este usuário registrou 12 pagamentos; inative-o". Já `client_history` e `invoice_history` usam `SetNull`: a auditoria sobrevive ao usuário, sem o nome dele.

---

## 11. Scripts disponíveis

### Raiz

| Comando               | O que faz                                    |
| --------------------- | -------------------------------------------- |
| `npm run install:all` | Instala backend e frontend                   |
| `npm run dev:api`     | Sobe a API em modo desenvolvimento           |
| `npm run dev:web`     | Sobe a interface                             |
| `npm run build`       | Compila os dois para produção                |
| `npm run typecheck`   | Confere os tipos sem compilar                |
| `npm run lint`        | Roda o ESLint nos dois projetos              |
| `npm run db:up`       | Sobe o container do PostgreSQL               |
| `npm run db:down`     | Para o container                             |
| `npm run db:logs`     | Acompanha o log do container                 |
| `npm run db:migrate`  | Aplica as migrations                         |
| `npm run db:seed`     | Cria o administrador                         |
| `npm run db:seed:demo`| Popula dados de demonstração                 |
| `npm run db:studio`   | Abre o Prisma Studio (navegador do banco)    |
| `npm run db:reset`    | **Apaga tudo**, migra e roda o seed de novo  |

Produção (usam `.env.production` e `docker-compose.production.yml` — seção 16):

| Comando               | O que faz                                                    |
| --------------------- | ------------------------------------------------------------ |
| `npm run prod:config` | Valida o compose e aponta variável faltando                  |
| `npm run prod:build`  | Constrói as imagens                                          |
| `npm run prod:up`     | Constrói, aplica as migrations e sobe tudo                   |
| `npm run prod:ps`     | Situação dos containers                                      |
| `npm run prod:logs`   | Acompanha os logs                                            |
| `npm run prod:seed`   | Cria o administrador inicial                                 |
| `npm run prod:backup` | Backup avulso do banco                                       |
| `npm run prod:down`   | Para os containers (**não** apaga os dados)                  |

### Dados de demonstração

Um banco recém-criado tem apenas o administrador: o painel abre zerado e as listagens
vazias, o que torna difícil avaliar as telas. O comando abaixo preenche clientes,
contratos, faturas e pagamentos com um histórico coerente:

```powershell
npm run db:seed:demo
```

Rode `npm run db:seed` antes: o script precisa de um administrador existente para
registrar quem lançou cada pagamento, e aborta com aviso se não encontrar nenhum.

Pode ser executado quantas vezes quiser — mas entenda o que ele faz antes de recriar os
dados: **apaga todos os pagamentos, faturas, contratos e clientes da base**, e não apenas
os que ele mesmo criou. A tabela `users` não é tocada, então o administrador permanece.

> Use apenas em desenvolvimento. Contra a base do escritório, isto apagaria os clientes
> reais e todo o histórico financeiro.

---

## 12. Segurança

Implementado nesta etapa:

- **Senhas** gravadas com bcrypt (custo 12). Texto puro nunca é persistido nem registrado em log.
- **JWT** assinado com segredo de 32+ caracteres, validado na inicialização.
- **Sessão verificada no banco a cada requisição** — um usuário desativado perde o acesso na hora, sem esperar o token expirar.
- **Autorização por perfil** via `roleMiddleware`, e **por campo** onde a rota sozinha não basta: na edição de clientes o funcionário altera contato e endereço, não a identidade fiscal; na edição de contratos ele não altera a situação. Nos dois casos a checagem é feita sobre o conteúdo do corpo, porque proteger apenas a rota dedicada deixaria o `PUT` como porta dos fundos.
- **Trilha de auditoria** de clientes e faturas: cada alteração grava campo, valor anterior, valor novo, autor e horário; nas faturas entram também pagamentos, estornos, cancelamentos e reaberturas. O histórico sobrevive à remoção do usuário que o gerou.
- **Notificações são pessoais e o recorte vem da sessão.** Nenhuma rota aceita `userId` do cliente, e uma notificação de outro usuário responde 404 em vez de 403 — um 403 confirmaria a existência do id.
- **Situação de fatura não é aceita do cliente HTTP.** `status` é recusado no corpo da emissão e da edição — quem decide é o servidor, a partir da data, dos pagamentos e do cancelamento.
- **Os relatórios financeiros são exclusivos do administrador**, checados no serviço porque a rota é compartilhada pelos quinze relatórios. O catálogo também os omite para o funcionário — mas quem barra é a checagem, não a omissão.
- **Exportação com teto de 5.000 linhas** e sem dependência externa: os três formatadores são código do próprio projeto, então não há biblioteca de terceiros processando dado financeiro nem superfície de dependência a monitorar.
- **O consolidado financeiro é exclusivo do administrador**, em todas as três rotas `/api/finance/*`. O funcionário continua vendo o financeiro de cada cliente e contrato nas fichas; o que não vê é a soma do escritório.
- **Datas vão ao SQL como texto `YYYY-MM-DD`, nunca como `Date`.** A sessão do banco roda em `America/Sao_Paulo`, e um `Date` de meia-noite UTC convertido por `::date` retrocede um dia — o período perderia o dia corrente inteiro. Esta regra vale para todo raw query do projeto.
- **Teto de paginação** de 100 registros por página: sem ele, `?pageSize=999999` seria uma negação de serviço trivial contra o banco.
- **Validação de toda entrada** com Zod antes de tocar no banco.
- **SQL injection**: o Prisma monta consultas parametrizadas; não há concatenação de SQL no projeto.
- **CORS** com lista branca explícita — nunca `origin: true`.
- **Rate limit**: 300 req/min por IP no geral, 10/min em `/auth/login`, 6/min na troca de senha.
- **Helmet** para cabeçalhos de segurança; corpo de requisição limitado a 1 MB.
- **Mensagem única** para e-mail inexistente e senha errada, com tempo de resposta equalizado. Distinguir os casos transformaria o login num verificador de quais e-mails existem.
- **A senha nunca sai pela API.** Todo o módulo de usuários lê pela constante `USER_SELECT`, que não inclui o campo — não existe consulta sem `select` para alguém esquecer de filtrar. As duas funções que precisam do hash (login e troca de senha) o pedem explicitamente e o descartam em seguida.
- **Gerenciar usuários é exclusivo do administrador**, em todas as rotas `/api/users/*`, com uma exceção deliberada: `POST /users/me/password`, que age apenas sobre o dono do token. Um `userId` injetado no corpo é ignorado.
- **Revogação imediata de token.** Resetar acesso, desativar conta e trocar senha gravam `password_changed_at`; o middleware recusa todo token anterior a esse instante. Sem isso, cortar o acesso de alguém levaria até 24 horas para surtir efeito — inclusive quando o corte é feito porque a conta foi comprometida.
- **Senha provisória de uso único.** Gerada pelo sistema com `crypto.randomBytes` e sorteio sem viés de módulo, exibida uma única vez, nunca persistida em texto puro nem registrada em log. A conta fica marcada para troca obrigatória no acesso seguinte.
- **O administrador não consegue se derrubar**, e nenhuma operação deixa o sistema sem administrador ativo — a contagem roda dentro da transação da escrita e a desfaz se chegar a zero.
- **Rate limit** de 6 tentativas por minuto em `POST /users/me/password`: a rota confere a senha atual, então aceita palpites.
- **Alterar a configuração do sistema é exclusivo do administrador**, nas três rotas de escrita. A leitura é aberta porque a interface precisa da marca para se desenhar, e nada ali é sigiloso.
- **Trocar o próprio e-mail exige a senha atual.** O e-mail é a credencial de login: sem essa confirmação, um computador destravado por dois minutos permitiria apontar a conta para outro endereço e, de lá, pedir um reset de acesso.
- **`PUT /users/me` recusa `role` e `active`** (schema estrito): a edição do próprio cadastro não é caminho curto para se promover a administrador.
- **O logotipo é validado por tipo e tamanho** antes de ser gravado, e o SVG é renderizado apenas via `<img>` — contexto em que o navegador não executa script embutido no arquivo. Injetado inline no HTML, seria um vetor de XSS.
- **O fuso horário vem de uma lista fechada.** Texto livre faria `Intl` lançar exceção dentro de `today()`, chamada em praticamente toda requisição — um erro de digitação derrubaria o sistema inteiro, não só a tela de configuração.
- **Trilha de auditoria append-only** de login, logout, tentativa recusada, criação, alteração, inativação, cancelamento, pagamento, estorno, mudança de perfil, reset de acesso, alteração de configuração e exportação — com autor, IP, navegador e dados da alteração. Sem rota de escrita, edição ou exclusão.
- **Constraints CHECK no banco** como última linha de defesa das invariantes: valor de fatura, pagamento e contrato sempre positivo; dia de vencimento entre 1 e 31; término não antes do início; vencimento não antes da emissão; CPF/CNPJ só com dígitos e no tamanho certo; e-mail com formato mínimo; e **senha obrigatoriamente com a forma de um hash bcrypt** — um bug que esquecesse o `hashPassword` é recusado pelo banco.
- **Campos sensíveis removidos do log** (`redact` do pino, com `remove: true`): cabeçalho de autorização, cookie, senha, token e o data URL do logotipo. O Fastify não registra corpo por padrão; a lista existe para o dia em que alguém ligar esse log para depurar.
- **Erros internos não vazam** stack trace nem detalhe de banco em produção.
- **Configuração de produção validada na subida.** Com `NODE_ENV=production` a API não inicia com o `JWT_SECRET` ou a senha de banco dos arquivos de exemplo, sem `CORS_ORIGIN`, ou com origem malformada. Os valores de exemplo têm o formato certo e passariam por uma validação comum — e estão publicados no repositório.
- **Política de conteúdo (CSP) na interface**, definida pelo nginx: só scripts do próprio sistema executam, nenhum de terceiros e nenhum embutido no HTML. É a principal contenção contra XSS enquanto o token ficar no `localStorage`. Acompanham `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e HSTS (só sob HTTPS).
- **Respostas da API com `Cache-Control: no-store`**: dado financeiro de usuário autenticado não fica em cache de navegador nem de proxy.
- **O IP do visitante não pode ser forjado.** O nginx sobrescreve `X-Forwarded-For` com o endereço de quem conectou, e só aceita o cabeçalho vindo de um proxy declarado em `TRUSTED_PROXY_CIDR`. Sem isso, trocar o cabeçalho a cada requisição contornaria o limite de tentativas de login.
- **A API e o banco não publicam porta** no compose de produção; só o nginx (ou o Caddy) é alcançável de fora. Os processos rodam sem root e sem capacidades do kernel.
- **Seeds protegidos em produção:** o do administrador recusa a senha de exemplo e marca a conta para troca obrigatória no primeiro login; o de demonstração, que apaga os dados, se recusa a executar.
- **Destino pós-login restrito a caminho interno.** O endereço para onde a pessoa volta depois de entrar vem de um link que pode ter sido montado por terceiros; `//site.com` e `/\site.com` são descartados.
- **Sem source maps publicados**: o build de produção não entrega o código-fonte original.
- **Dependências auditadas** (`npm audit --omit=dev`): `@fastify/jwt` atualizado para a versão 10, que corrige avisos críticos da biblioteca de assinatura de token.

**Ainda não implementado (planejado):**

- Refresh token com rotação em cookie `httpOnly`. Hoje o token de acesso fica no `localStorage` — prático, mas vulnerável a XSS. Todo o acesso ao token passa por `frontend/src/utils/storage.ts` justamente para que a troca seja local.
- Recuperação de senha **por autoatendimento**, via link enviado por e-mail. Hoje quem esquece a senha pede a um administrador, que reseta o acesso — suficiente para um escritório, insuficiente se o sistema crescer.
- **Moeda e formato de data aplicados à exibição.** Os dois já são configuráveis, validados e guardados; a formatação da interface continua fixa em Real e dia/mês/ano. Ligar os dois é trocar a instanciação dos `Intl.*Format` em `frontend/src/utils/format.ts` pelos valores da configuração.
- **Tema escuro.** Os tokens já estão mapeados em `src/index.css` e a rampa da marca já é dinâmica; falta o botão de alternância e a persistência da escolha.
- Auditoria de contratos **campo a campo** — hoje o histórico detalhado existe para clientes e faturas; contratos aparecem na trilha de auditoria, mas sem o antes/depois de cada campo.
- **Limite de tentativas por CONTA, além de por IP.** Hoje a força bruta é contida por IP (10 logins/min); quem rotacionar endereço contorna isso. A trilha já registra cada recusa, o que dá visibilidade — falta a ação automática. Um bloqueio por conta precisa ser desenhado com cuidado para não virar negação de serviço contra o dono da conta.
- **Gravação da auditoria dentro da transação da operação.** Hoje uma falha ao auditar é engolida para não derrubar o negócio; sob exigência regulatória de não-repúdio, essa escolha se inverte.
- **Suíte de testes automatizados.** Não há testes unitários nem de integração no repositório. O que existe é o teste de fumaça de `scripts/smoke-test.sh`, que confere uma instalação pronta de fora. A API já está preparada para testes de integração — `buildApp()` monta a aplicação sem abrir porta, para uso com `app.inject()` — e é por onde vale começar: regras de pagamento parcial, estorno e cálculo de situação da fatura.
- **Avisos de dependência ainda abertos** (`npm audit --omit=dev`), todos fora do caminho de uma requisição:
  - `prisma` (CLI) → `deepmerge-ts`: afeta o carregamento do arquivo de configuração do Prisma, não a API. A correção oferecida pelo npm é um *downgrade*; aguarda versão corrigida.
  - `tailwindcss` 3 → `braces`, `micromatch`, `fast-glob`…: ferramentas de build, não vão para o navegador. A correção é migrar para o Tailwind 4.
  - `react-router-dom` 6: redirecionamento aberto via `<Link>`/`navigate` com endereço controlado por terceiros. O único ponto do sistema que navega para um endereço vindo de fora (o retorno pós-login) foi restringido a caminho interno; a correção definitiva é migrar para o React Router 7.

---

## 13. Solução de problemas

**`'npm' não é reconhecido...`**
O Node não está instalado ou o terminal foi aberto antes da instalação. Feche e abra um terminal novo.

**`'psql' não é reconhecido...`**
O instalador do PostgreSQL não adiciona o `psql` ao PATH. Use o caminho completo:
`& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost`.

**`Cannot find module '.prisma/client'`** ou **`Cannot find module '@esbuild/win32-x64'`**
Os scripts de instalação foram bloqueados pelo npm. Volte ao [Passo 1b](#passo-1b--liberar-os-scripts-de-instalação-npm-11-ou-superior).

**`P3014: Prisma Migrate could not create the shadow database`**
O usuário do banco não tem permissão para criar bancos. Rode, como `postgres`:
`ALTER ROLE pro_accounting CREATEDB;` (explicado no Passo 6).

**`Port 5432 is already allocated`** ao subir o Docker
Você já tem um PostgreSQL nativo ocupando a 5432. O `docker-compose.yml` usa 5433 por padrão
justamente por isso — confira se `POSTGRES_PORT` no `.env` da raiz não foi alterado para 5432.

**`Não foi possível conectar ao PostgreSQL`**
O container não está no ar. Rode `docker compose ps`. Se não aparecer nada, `docker compose up -d`. Confirme também que o Docker Desktop está **aberto**, não apenas instalado.

**`Variáveis de ambiente inválidas` ao subir a API**
A mensagem já diz qual variável está faltando. Confira se `backend/.env` existe (não só o `.env.example`).

**`Authentication failed against database server`**
A senha em `DATABASE_URL` (backend/.env) não é a mesma de `POSTGRES_PASSWORD` (.env da raiz). Se você trocou a senha *depois* de criar o container, o banco manteve a antiga — recrie com `docker compose down -v; docker compose up -d` (**isso apaga os dados**).

**`Port 5432 is already allocated`**
Já existe um PostgreSQL usando a porta. Mude `POSTGRES_PORT=5433` no `.env` da raiz e ajuste a porta na `DATABASE_URL`.

**Login devolve erro de CORS**
O frontend não está em `http://localhost:5173`, ou a porta mudou. Confira `CORS_ORIGIN` em `backend/.env`.

**A tela carrega mas o selo mostra "API offline"**
A API não está rodando. Confira o Terminal 1 e teste `curl http://localhost:3333/api/health`.

**`P1001: Can't reach database server`** ao rodar migrations
Mesmo caso: o banco não está no ar ou a `DATABASE_URL` aponta para host/porta errados.

**O container do PostgreSQL encerra com `in 18+, these Docker images are configured to store database data in a format...`**
O volume está montado em `/var/lib/postgresql/data`. A partir do PostgreSQL 18 o ponto de montagem
é `/var/lib/postgresql` (sem `/data`). Os dois arquivos de compose do projeto já usam o caminho novo.

**Produção: `Não foi possível iniciar: configuração insegura ou inválida`**
A API recusou um valor de exemplo ou uma origem malformada; a mensagem lista cada variável. Corrija
no `.env.production` e rode `docker compose ... up -d` de novo.

**Produção: `required variable ... is missing a value`**
Falta uma variável obrigatória no `.env.production` — ou o comando foi executado sem
`--env-file .env.production`.

**Produção: o `backend` não sobe e o `migrate` aparece como `Exited (1)`**
Uma migration falhou; a API não inicia sobre um banco pela metade. Veja o motivo com
`docker compose ... logs migrate`.

**Produção: a API não conecta ao banco depois de trocar `POSTGRES_PASSWORD`**
A senha é gravada no banco na primeira subida; mudar o arquivo depois não altera o banco já criado.
Troque com `ALTER ROLE` ([seção 16.9](#169-restaurar-um-backup)).

**Produção: tela branca e, no console, `violates the following Content Security Policy directive`**
Algo que a política de conteúdo não autoriza está sendo carregado — tipicamente a API em outro
domínio. Acrescente o endereço em `connect-src`, em `frontend/nginx/security-headers.conf`, e
reconstrua a imagem da interface.

**Produção: todos os usuários recebem "Muitas tentativas" ao mesmo tempo**
Há um proxy na frente do nginx e a API está vendo o IP dele para todo mundo. Informe o endereço do
proxy em `TRUSTED_PROXY_CIDR` ([seção 16.6](#166-https)).

No **Docker Desktop** (Windows e macOS) isso acontece sempre, e não há o que configurar: toda
conexão chega ao container vinda do endereço interno do Docker (`172.x.0.1`), então todos os
visitantes dividem o mesmo limite de tentativas e é esse o endereço que a auditoria registra. O
Docker Desktop serve para teste local; num servidor Linux com o Docker Engine padrão (não o modo
*rootless*) o endereço de quem conectou é preservado.

**Produção: a tela mostra "O sistema está indisponível no momento"**
A interface respondeu, mas a API não — está parada, reiniciando ou sendo atualizada. É a resposta
que o nginx e o Caddy dão no lugar da API (status 502 ou 504). Durante um `up -d --build` dura
alguns segundos e passa sozinho. Se persistir, veja `npm run prod:ps` e
`docker compose ... logs backend migrate`.

---

## 14. Trocar o logotipo

O logo atual é provisório. O procedimento completo está em
[`frontend/src/assets/LOGO.md`](frontend/src/assets/LOGO.md).

Resumo: substitua `frontend/src/assets/logo.svg` e `logo-mark.svg` mantendo os nomes. Nenhuma linha de código muda.

---

## 15. Próximas etapas

| Etapa | Escopo                                                                  | Situação |
| ----- | ----------------------------------------------------------------------- | -------- |
| 1     | Infraestrutura: autenticação, banco, layout, ligação frontend ↔ API      | Concluída |
| 2     | Clientes: CRUD, busca, filtros, paginação, inativação, histórico         | Concluída |
| 3     | Contratos: CRUD, encerramento, cancelamento, renovação, faturas          | Concluída |
| 4     | Faturas: CRUD, cancelamento, filtros, auditoria                          | Concluída |
| 6     | Pagamentos: registro, duplicata, parcial, estorno, histórico de caixa    | Concluída |
| 5a    | Painel: indicadores reais, gráficos, alertas, atividade recente          | Concluída |
| 7     | Financeiro: períodos, gráficos, tabela, exportação (os 3 formatos)        | Concluída |
| 8     | Notificações: alertas persistidos, sino, leitura por usuário             | Concluída |
| 9     | Usuários e permissões: RBAC, perfis, inativação, reset de acesso         | Concluída |
| 10    | Relatórios: catálogo de 15, filtros, exportação CSV / Excel / PDF        | Concluída |
| 11    | Configurações: empresa, identidade visual, perfil, preferências          | Concluída |
| 12    | Auditoria e segurança: trilha, RBAC revisado, constraints, hardening     | Concluída |
| 13    | UX e responsividade: tabelas adaptáveis, acessibilidade, estados de erro  | Concluída |
| 14    | Produção: Docker, HTTPS, backup e restauração, hardening, documentação    | Concluída |

**Por que o painel veio antes dos contratos.** A ordem original previa o painel por
último. Ele foi antecipado porque os indicadores são o teste mais honesto do modelo de
dados: as consultas de faturamento, inadimplência e recebimento atravessam as cinco
tabelas de uma vez e revelam cedo qualquer erro de modelagem — enquanto corrigi-lo ainda
é barato. O painel já lê dados reais; a tela **Financeiro**, com fluxo de caixa por
período, continua na etapa 5b.

---

## 16. Produção

Como colocar o sistema num servidor. Tudo roda em containers Docker, descritos em
[`docker-compose.production.yml`](docker-compose.production.yml).

### 16.1 Arquitetura

```text
    navegador
        │  HTTPS — Caddy (perfil "https") ou o proxy que o servidor já tiver
        ▼
    frontend    nginx: entrega a interface e repassa /api
        │
        ▼
    backend     API Node (Fastify + Prisma)
        │
        ▼
    postgres    PostgreSQL 18, dados em volume nomeado
```

| Serviço    | Imagem                               | Papel                                                  | Porta no servidor       |
| ---------- | ------------------------------------ | ------------------------------------------------------ | ----------------------- |
| `postgres` | `postgres:18-alpine`                 | Banco de dados                                         | nenhuma                 |
| `migrate`  | `pro-accounting-api`                 | Aplica as migrations a cada subida e termina           | nenhuma                 |
| `backend`  | `pro-accounting-api`                 | API                                                    | nenhuma                 |
| `frontend` | `pro-accounting-web`                 | nginx: interface + proxy de `/api`                     | `APP_BIND` (padrão 80)  |
| `backup`   | `postgres:18-alpine`                 | `pg_dump` ao subir e a cada 24 h, em `./backups`       | nenhuma                 |
| `caddy`    | `caddy:2-alpine` (perfil `https`)    | HTTPS com certificado automático                       | 80 e 443                |

Só o `frontend` (ou o Caddy) é alcançável de fora. **A API e o banco não publicam porta**: conversam
apenas pela rede interna do compose. Interface e API saem pelo **mesmo endereço** — por isso o build
de produção usa `VITE_API_URL=/api`, um caminho relativo, e não há requisição entre origens.

### 16.2 O que o servidor precisa ter

- Linux com **Docker Engine 24+** e o plugin **Docker Compose v2** (`docker compose version`).
- 2 GB de RAM e 10 GB de disco livres são suficientes para um escritório.
- Para HTTPS automático: um domínio apontando para o servidor e as portas **80** e **443** liberadas.
- O repositório clonado (ou copiado) no servidor. Nenhum Node.js precisa ser instalado: o build
  acontece dentro das imagens.

### 16.3 Configuração

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Preencha o arquivo. As variáveis, por ordem de importância:

| Variável                 | Exemplo                          | Para que serve                                                                 |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------ |
| `APP_URL`                | `https://app.suaempresa.com.br`  | Endereço público, como aparece no navegador. É a única origem aceita pelo CORS  |
| `POSTGRES_PASSWORD`      | *(gerada)*                       | Senha do banco. **Só letras e números** — ela entra numa URL de conexão         |
| `JWT_SECRET`             | *(gerado)*                       | Assina os tokens de sessão. Mínimo de 32 caracteres                             |
| `DOMAIN`                 | `app.suaempresa.com.br`          | Domínio do certificado. Só para o perfil `https`                                |
| `APP_BIND`               | `80` ou `127.0.0.1:8080`         | Onde a interface é publicada no servidor                                        |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | —                        | Administrador inicial, usados uma vez pelo seed                                 |
| `JWT_EXPIRES_IN`         | `8h`                             | Validade da sessão                                                              |
| `POSTGRES_DB` / `POSTGRES_USER` | `pro_accounting`          | Nome do banco e do usuário                                                      |
| `DB_TIMEZONE`            | `America/Sao_Paulo`              | Fuso do banco                                                                   |
| `LOG_LEVEL`              | `info`                           | Nível mínimo do log da API                                                      |
| `BACKUP_INTERVAL_HOURS`  | `24`                             | Intervalo entre backups automáticos                                             |
| `BACKUP_RETENTION_DAYS`  | `14`                             | Backups mais antigos que isso são apagados                                      |
| `APP_VERSION`            | `latest`                         | Marca das imagens construídas                                                   |
| `TRUSTED_PROXY_CIDR`     | `127.0.0.1/32`                   | Endereço do seu proxy, se houver um na frente do nginx                          |

Gerar os dois segredos:

```bash
openssl rand -hex 32        # POSTGRES_PASSWORD
openssl rand -base64 48     # JWT_SECRET
```

A API **se recusa a iniciar em produção** com o `JWT_SECRET` ou a senha de banco dos arquivos de
exemplo, sem `APP_URL`, ou com uma origem de CORS malformada (com caminho, com curinga) — e diz qual
variável corrigir. É intencional: os valores de exemplo estão publicados no repositório.

O `.env.production` não é versionado e não entra em nenhuma imagem.

### 16.4 Subir

Confira a configuração antes — interpola todas as variáveis e aponta a que estiver faltando:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

Depois:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

O que acontece, nesta ordem:

1. as duas imagens são construídas (alguns minutos na primeira vez);
2. o `postgres` sobe e espera ficar saudável;
3. o `migrate` roda `prisma migrate deploy` — **cria as tabelas na primeira vez e aplica só o que
   estiver pendente nas seguintes** — e termina;
4. o `backend` sobe **somente se as migrations terminaram sem erro**;
5. o `frontend` sobe quando a API responde ao health check.

Conferir:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps -a
```

`postgres`, `backend` e `frontend` devem aparecer como `healthy`; `migrate`, como `Exited (0)`.

Para não repetir o comando longo, há atalhos na raiz do projeto (`npm run prod:up`, `prod:ps`,
`prod:logs`, `prod:down`, `prod:backup`, `prod:seed`) ou um alias:

```bash
alias dcp='docker compose --env-file .env.production -f docker-compose.production.yml'
```

Os exemplos abaixo usam `dcp`.

### 16.5 Criar o administrador

Com `ADMIN_EMAIL` e `ADMIN_PASSWORD` preenchidos no `.env.production`:

```bash
dcp run --rm backend node dist/database/seed.js
```

Em produção essa senha é **provisória**: o primeiro login abre a troca obrigatória, que não pode ser
dispensada. O seed também recusa as senhas de exemplo publicadas no repositório. Depois de criar
o administrador, **apague `ADMIN_PASSWORD` do `.env.production`**.

O seed é idempotente: rodar de novo não duplica o usuário nem troca a senha dele.

> `seed-demo` (dados de demonstração) **não roda em produção** — o script apaga todos os clientes,
> contratos, faturas e pagamentos, e se recusa a executar com `NODE_ENV=production`.

### 16.6 HTTPS

Escolha **um** dos dois caminhos.

**A. Caddy com certificado automático** — quando o servidor não tem outro proxy.

No `.env.production`: `DOMAIN=app.suaempresa.com.br`, `APP_URL=https://app.suaempresa.com.br` e
`APP_BIND=127.0.0.1:8080` (a interface deixa de ser publicada direto; quem atende a internet é o
Caddy). Depois:

```bash
dcp --profile https up -d --build
```

O Caddy obtém o certificado Let's Encrypt na primeira subida, renova sozinho e redireciona
`http://` para `https://`. Pré-requisitos: o domínio já apontando para o servidor e as portas 80 e
443 abertas.

**B. Proxy que o servidor já tem** (nginx, Traefik, balanceador, Cloudflare).

Não use o perfil `https`. Aponte o proxy para a porta do `frontend` (`APP_BIND`) e faça-o enviar
`X-Forwarded-Proto` e `X-Forwarded-For`. Informe o endereço do proxy em `TRUSTED_PROXY_CIDR`: é o
que faz o limite de tentativas de login e a auditoria enxergarem o IP real do visitante, e não o do
proxy. Sem isso, todos os usuários do escritório dividiriam o mesmo limite de requisições.

Nos dois casos o cabeçalho HSTS só é emitido quando a requisição chegou por HTTPS.

> **Sem HTTPS**, senha e token de sessão trafegam em texto puro. Só é aceitável numa rede interna
> isolada. A API registra um aviso no log a cada subida se `APP_URL` começar com `http://`.

### 16.7 Backup

O serviço `backup` faz um `pg_dump` ao subir e outro a cada `BACKUP_INTERVAL_HOURS`, grava em
`./backups` e apaga os mais antigos que `BACKUP_RETENTION_DAYS`:

```text
backups/
├── pro_accounting-20261012-030000.dump          # formato "custom", comprimido
└── pro_accounting-20261012-030000.dump.sha256   # soma de verificação
```

Cada arquivo é **validado antes de ser considerado pronto** (`pg_restore --list` lê o índice
inteiro): um dump truncado falha na hora do backup, não no dia da restauração. Um backup que falha
não apaga nenhum dos anteriores.

Backup avulso — faça um **antes de toda atualização**:

```bash
dcp exec backup sh /scripts/backup.sh
```

Acompanhar:

```bash
dcp logs backup
```

> **`./backups` fica no mesmo disco do banco.** Isso protege contra erro humano e migration ruim,
> não contra a perda do servidor. Copie a pasta para fora periodicamente — outro servidor ou
> armazenamento em nuvem:
>
> ```bash
> rsync -a --delete ./backups/ usuario@outro-servidor:/backups/pro-accounting/
> ```
>
> Um backup que nunca foi restaurado é uma esperança, não um backup: restaure um deles num ambiente
> de teste de tempos em tempos.

### 16.8 Atualizar o sistema

```bash
dcp exec backup sh /scripts/backup.sh     # 1. backup avulso
git pull                                  # 2. código novo
dcp up -d --build                         # 3. reconstrói e sobe; as migrations rodam sozinhas
dcp ps                                    # 4. confere
```

Se a migration nova falhar, o `migrate` sai com erro e **a API antiga continua no ar** (o `backend`
novo não chega a subir). Veja o motivo com `dcp logs migrate`.

Para poder voltar a uma versão anterior da aplicação, mude `APP_VERSION` a cada publicação
(`APP_VERSION=2026.10.1`): as imagens antigas continuam no servidor. Voltar o **código** é
`APP_VERSION=<anterior>` e `dcp up -d`; voltar o **banco**, se a migration tiver alterado dados, é
restaurar o backup do passo 1.

Quem estiver com o sistema aberto durante a atualização continua na versão antiga até navegar para
uma tela carregada sob demanda cujo arquivo mudou; nesse momento a página recarrega sozinha, já na
versão nova. Um formulário preenchido e ainda não salvo nessa aba se perde no recarregamento — avise
os usuários antes de atualizar em horário de uso.

### 16.9 Restaurar um backup

```bash
dcp stop backend                                                    # ninguém grava durante a troca
dcp exec backup sh /scripts/restore.sh /backups/<arquivo>.dump      # pede o nome do banco para confirmar
dcp start backend
```

O script **não restaura por cima do banco em uso**. Ele:

1. confere a soma de verificação e a integridade do arquivo;
2. restaura o backup num banco **novo e vazio**;
3. confere que vieram as tabelas e as migrations do sistema;
4. só então troca os nomes — o banco atual vira `<banco>_antes_<data>` e o restaurado assume o nome
   oficial.

Se qualquer passo falhar, o banco atual continua intacto. Depois da troca, o banco anterior fica
guardado até você apagá-lo (o script imprime o comando). Restaurar direto sobre o banco em produção
apagaria os dados atuais *antes* de saber se o backup está inteiro.

Sem o Docker — por exemplo, para restaurar num PostgreSQL instalado na máquina — os mesmos scripts
funcionam com as variáveis padrão do PostgreSQL:

```bash
export PGHOST=localhost PGPORT=5432 PGUSER=pro_accounting PGPASSWORD='...' PGDATABASE=pro_accounting
BACKUP_DIR=./backups sh deploy/backup/backup.sh
sh deploy/backup/restore.sh ./backups/<arquivo>.dump
```

**Trocar a senha do banco** depois de criado (mudar `POSTGRES_PASSWORD` no arquivo não altera um
banco que já existe):

```bash
dcp exec postgres psql -U pro_accounting -c "ALTER ROLE pro_accounting PASSWORD 'nova-senha'"
# atualize POSTGRES_PASSWORD no .env.production e:
dcp up -d
```

### 16.10 Logs e monitoramento

```bash
dcp logs -f --tail=100              # tudo
dcp logs -f backend                 # só a API
```

Em produção a API escreve **JSON, uma linha por evento, na saída padrão** — sem arquivo de log
dentro do container. Quem guarda e rotaciona é o Docker: cada serviço fica limitado a 5 arquivos de
10 MB (`x-logging` no compose). Senha, token e cabeçalho de autorização são removidos antes de a
linha ser escrita.

| Nível | Número | O que aparece                                                                    |
| ----- | ------ | -------------------------------------------------------------------------------- |
| info  | 30     | Cada requisição: método, rota, status e tempo de resposta                        |
| warn  | 40     | Erros previstos: validação, 401, 404, limite de requisições (429)                |
| error | 50     | Falhas inesperadas — vale um alerta                                              |
| fatal | 60     | Exceção não capturada; o processo se encerra e o Docker sobe outro               |

Verificações de saúde:

| Endereço            | Quem responde | O que prova                                                       |
| ------------------- | ------------- | ----------------------------------------------------------------- |
| `GET /api/health`   | API           | Processo no ar **e** banco respondendo (`SELECT 1`). 503 se não   |
| `GET /healthz`      | nginx         | A interface está sendo servida                                    |

Aponte um monitor externo (UptimeRobot, Better Stack, o do seu provedor) para
`https://<seu-domínio>/api/health` e alerte em qualquer resposta diferente de 200. As verificações
de saúde não aparecem no log em nível `info`, para não enterrar o que importa.

### 16.11 Teste de fumaça

Depois de subir — e depois de cada atualização:

```bash
sh scripts/smoke-test.sh https://app.suaempresa.com.br admin@suaempresa.com.br 'senha'
```

São 36 verificações (37 sob HTTPS, com a do HSTS), só de leitura: interface, cache, cabeçalhos de
segurança, health check, banco, rotas protegidas, formato de erro, CORS, login e paginação. Sem e-mail e senha, roda só a parte
pública. Sai com código 0 se tudo passar.

### 16.12 Sem Docker

O compose é o caminho suportado, mas nada nele é obrigatório. Para rodar direto no servidor:

```bash
# API
cd backend
npm ci
npm run build                          # prisma generate + tsc → dist/
npm ci --omit=dev && npx prisma generate
NODE_ENV=production npx prisma migrate deploy
NODE_ENV=production node dist/server.js     # sob systemd ou pm2

# Interface
cd frontend
npm ci
npm run build                          # usa frontend/.env.production → dist/
```

As variáveis da API são as de `backend/.env.example`, com `NODE_ENV=production` e `CORS_ORIGIN` no
lugar de `APP_URL`. Sirva `frontend/dist` com o nginx usando
[`frontend/nginx/default.conf.template`](frontend/nginx/default.conf.template) como base: troque as
três variáveis (`API_UPSTREAM`, `NGINX_RESOLVER`, `TRUSTED_PROXY_CIDR`) pelos seus valores.

> No Windows com Git Bash, **não** passe `VITE_API_URL=/api` pela linha de comando: o shell converte
> `/api` num caminho de arquivo do Windows e esse valor vai embutido no build. Deixe o
> `frontend/.env.production` definir a variável.

### 16.13 Checklist de produção

O que o projeto garante, e como foi conferido:

| Item            | Situação                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| HTTPS           | Caddy com certificado automático (perfil `https`) ou proxy próprio; HTTP redireciona; HSTS só sob HTTPS                 |
| CORS            | Lista branca com uma origem (`APP_URL`); origem estranha não recebe cabeçalho; curinga e caminho são recusados na subida |
| Secrets         | Só em `.env.production` (fora do Git e das imagens); valores de exemplo recusados em produção; nada de segredo no log   |
| JWT             | Segredo de 32+ caracteres obrigatório; sessão de 8 h; token adulterado ou sem assinatura (`alg: none`) → 401            |
| Banco           | PostgreSQL 18 sem porta publicada, volume nomeado, SCRAM-SHA-256, health check                                          |
| Migrations      | `prisma migrate deploy` em serviço próprio; a API não sobe sobre migration que falhou; 11 migrations aplicam do zero    |
| Backup          | Automático com retenção e validação; restauração em banco novo com troca de nomes; arquivo corrompido é recusado        |
| Logs            | JSON na saída padrão, rotação pelo Docker, campos sensíveis removidos, health check fora do log                         |
| Health check    | `/api/health` (API + banco) e `/healthz` (interface), usados pelo Docker para ordenar a subida                          |
| Build           | Imagens em vários estágios, sem ferramentas de desenvolvimento; processo sem root; sem source maps publicados           |
| Responsividade  | Sem rolagem lateral de 375 px a 1536 px, em oito larguras e também no build de produção (em 320 px, Faturas rola 27 px)  |
| Testes          | Teste de fumaça automatizado (`scripts/smoke-test.sh`). **Não há suíte de testes unitários** — ver a seção 12           |

O que cabe a quem opera — o projeto não tem como fazer por você:

- [ ] Preencher `.env.production` com segredos **gerados**, e `chmod 600`.
- [ ] Apontar o domínio para o servidor e liberar as portas 80 e 443 no firewall — e **só** elas
      (mais a 22 do SSH).
- [ ] Rodar o seed, trocar a senha provisória no primeiro login e apagar `ADMIN_PASSWORD` do arquivo.
- [ ] Rodar `scripts/smoke-test.sh` contra o endereço público.
- [ ] Configurar a cópia de `./backups` para **fora** do servidor e testar uma restauração.
- [ ] Apontar um monitor externo para `/api/health`.
- [ ] Manter o servidor atualizado (`apt upgrade`, `docker compose pull` das imagens base).

> **Sobre a verificação das imagens.** Além da análise estática (`hadolint`,
> `docker compose config`), as imagens foram construídas e a pilha inteira foi executada em Docker
> real (Docker Desktop 29 no Windows, em 13/10/2026), partindo de um volume vazio:
>
> - `docker compose build` e `up -d` sem erro; as 11 migrations aplicadas pelo serviço `migrate`;
> - teste de fumaça: 36 de 36 pelo nginx e 37 de 37 por HTTPS, com o container do Caddy;
> - navegador real sobre o build de produção: troca obrigatória da senha, todas as telas sob a CSP,
>   gráficos, 375 px, e o caminho cliente → contrato → fatura → pagamento gravando no banco;
> - API recriada com outro IP: o nginx volta a alcançá-la sem ser reiniciado; com ela parada, a
>   interface continua no ar e `/api` responde o erro em JSON;
> - `down` seguido de `up`: os dados permanecem; parada da API em menos de 1 s, com código 0;
> - backup avulso e automático; restauração desfazendo uma alteração feita depois do backup;
>   backup vazio e arquivo truncado recusados, com o banco em uso intacto;
> - limite de login mantido com `X-Forwarded-For` forjado a cada tentativa, pelo nginx e pelo Caddy;
> - containers da API e da interface sem root e sem capacidades; só a interface publica porta.
>
> **O que não foi exercitado:** a emissão de certificado Let's Encrypt para um domínio de verdade (o
> teste usou a autoridade interna do Caddy, com `DOMAIN=localhost`) e a execução num servidor Linux.
> Na primeira subida no servidor, rode o teste de fumaça contra o endereço público antes de
> divulgá-lo.

### 16.14 Deploy na Vercel

Alternativa ao Docker para quem não tem servidor. O projeto inteiro roda em **um único projeto da
Vercel**, no mesmo domínio: a interface é servida como site estático e a API do Fastify roda como
função serverless em `/api` (`vercel.json` e `api/index.js`). O banco é um PostgreSQL gerenciado —
o Supabase, conectado em **Storage** no painel da Vercel.

Cada envio ao ramo `main` do GitHub gera um deploy de produção; outros ramos geram uma
pré-visualização com endereço próprio. Em cada deploy, `scripts/vercel-build.mjs`:

1. confere as variáveis obrigatórias;
2. compila a API e roda a **mesma validação de configuração** que ela faz ao subir — com segredo de
   exemplo ou valor inválido, o build para aqui e a versão anterior continua no ar;
3. aplica as migrations pendentes (`prisma migrate deploy`, que nunca apaga dados);
4. cria o administrador, se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos (nunca altera a
   senha de um administrador que já existe);
5. compila a interface apontando para `/api`.

> **Atenção:** as migrations rodam no build, **antes** de o deploy entrar no ar — e também nos
> deploys de pré-visualização, se eles enxergarem o mesmo banco. As migrations do projeto só
> acrescentam (tabelas, colunas, índices), então a versão anterior continua funcionando sobre o
> banco já migrado.

**Variáveis** (Project Settings → Environment Variables):

| Variável         | Obrigatória | Observação                                                                 |
| ---------------- | ----------- | -------------------------------------------------------------------------- |
| `JWT_SECRET`     | sim         | Mínimo de 32 caracteres, **gerado** (`openssl rand -base64 48`). O valor dos arquivos de exemplo é recusado. |
| `DATABASE_URL`   | sim\*       | \*Dispensável com o Supabase conectado em Storage: a integração injeta `STORAGE_POSTGRES_PRISMA_URL` / `POSTGRES_PRISMA_URL`, usadas automaticamente. |
| `DIRECT_URL`     | não         | Conexão sem pooler, só para as migrations, quando `DATABASE_URL` for um pooler em modo transação. |
| `CORS_ORIGIN`    | não         | Na Vercel os endereços do próprio deploy já são autorizados sozinhos. Preencha só para liberar **outro** site. |
| `JWT_EXPIRES_IN` | não         | Duração da sessão. Padrão `1d`; o compose do Docker usa `8h` (um expediente). |
| `ADMIN_EMAIL`    | não         | Com `ADMIN_PASSWORD`, cria o administrador no deploy.                      |
| `ADMIN_PASSWORD` | não         | Mínimo de 8 caracteres, **só sua**: com uma senha de exemplo do repositório o seed é ignorado. Depois do primeiro deploy, troque a senha no sistema e apague a variável. |
| `ADMIN_NAME`     | não         | Padrão: "Administrador".                                                   |
| `LOG_LEVEL`      | não         | Padrão `info`. Os logs ficam em Deployments → Logs.                         |

**O que muda em relação ao Docker:**

- **Cabeçalhos de segurança** (CSP, `X-Frame-Options`…) vêm de `vercel.json`, com os mesmos valores
  do nginx. HTTPS e HSTS são da própria Vercel.
- **Backup:** o serviço `backup` do compose não existe aqui. Conte com os backups do Supabase (a
  frequência depende do plano) e, para ter uma cópia sua, rode de qualquer máquina com o PostgreSQL
  instalado, usando a conexão **sem pooler** do painel do Supabase:

  ```bash
  pg_dump --format=custom --no-owner --file=pro_accounting-$(date +%Y%m%d).dump "postgresql://..."
  ```

- **Limite de tentativas de login** é guardado na memória de cada instância da função. Com várias
  instâncias no ar ao mesmo tempo, o limite efetivo fica maior que 10 por minuto.
- **Banco pausado:** o plano gratuito do Supabase pausa o banco após dias sem uso. Restaure-o no
  painel do Supabase antes do deploy — senão as migrations falham e o build é cancelado.

---

## 17. Login com Google

Além de e-mail e senha, o sistema aceita **"Continuar com Google"**. Os dois jeitos convivem: a
mesma pessoa pode usar qualquer um, sempre na **mesma conta**.

### 17.1 Como funciona

```text
navegador ── "Continuar com Google" ──► Supabase Auth ──► Google (escolha da conta)
    ▲                                                          │
    └── /auth/callback?code=… ◄──────── Supabase Auth ◄────────┘
             │
             │ 1. troca o código por uma sessão do Supabase (PKCE)
             │ 2. POST /api/auth/google { token do Supabase }
             ▼
            API ── GET /auth/v1/user ──► Supabase Auth   (confirma a quem pertence o token)
             │
             ├─ encontra a conta pelo vínculo Google, ou pelo e-mail VERIFICADO pelo Google,
             │  ou cria uma nova (FUNCIONÁRIO, AGUARDANDO APROVAÇÃO)
             └─ conta ATIVA ► emite a MESMA sessão do login por senha
```

- **O Supabase Auth só confirma a identidade.** A sessão do sistema continua sendo uma só (o token da
  API), com as mesmas regras de bloqueio, perfil e encerramento de sessão. A sessão do Supabase é
  descartada assim que a API confere o token.
- **Nada vindo do navegador é aceito pela palavra:** a API pergunta ao próprio Supabase a quem o token
  pertence, e só aceita identidade do provedor Google com e-mail verificado.
- **Sem contas duplicadas.** No primeiro acesso, se já existe usuário com o e-mail verificado pelo
  Google, a Conta Google é **vinculada** a ele: mesmo cadastro, mesmo perfil, mesmo histórico. Dali em
  diante a conta é reconhecida pelo vínculo (`users.auth_user_id`), não pelo e-mail.
- **Ninguém vira administrador por ter um Gmail.** Conta nova entra como **Funcionário** e
  **aguardando aprovação**; um administrador aprova em *Usuários*. Se o e-mail já estiver vinculado a
  outra Conta Google, a API recusa e nada muda.
- **Situação da conta:** `ACTIVE` entra; `PENDING` vê "Seu acesso está aguardando aprovação do
  administrador."; `BLOCKED` vê "Sua conta está bloqueada. Entre em contato com o administrador." A
  API confere a situação a cada requisição — bloquear encerra na hora a sessão de quem estava logado.
- **Quem entra só com o Google não tem senha local:** o login por senha responde como "senha errada" e
  a troca de senha não aparece. Um administrador pode dar uma senha à conta com *Redefinir acesso*.
- **"Criar conta"** cadastra pelo Google. Não existe cadastro público com e-mail e senha: sem
  confirmação por e-mail, alguém poderia cadastrar o e-mail de outra pessoa e esperar a dona entrar
  com o Google para assumir a conta. Contas com e-mail e senha continuam sendo criadas pelo
  administrador.
- **O botão só aparece quando funciona:** a tela pergunta ao Supabase se o provedor Google está ligado.

### 17.2 Google Cloud Console

1. Em <https://console.cloud.google.com>, crie (ou escolha) um projeto, por exemplo "Pro Accounting".
2. Abra **Google Auth Platform** (antigo "Tela de consentimento OAuth"):
   - **Branding:** nome do app (`Pro Accounting`), e-mail de suporte e e-mail de contato.
     Em **Authorized domains**, adicione `eqkzadyjebyrrhuysdoh.supabase.co`.
   - **Audience:** tipo **External** e, quando terminar os testes, **Publish app** (*In production*).
     Em *Testing*, só os e-mails listados em *Test users* conseguem entrar.
   - **Data access:** os escopos `openid`, `.../auth/userinfo.email` e `.../auth/userinfo.profile`. São
     escopos básicos: não exigem a verificação do Google.
3. Em **Clients → Create client**, escolha **Web application**:
   - **Authorized redirect URIs:** `https://eqkzadyjebyrrhuysdoh.supabase.co/auth/v1/callback`
     (é o Supabase que recebe a resposta do Google, não o sistema).
   - **Authorized JavaScript origins:** não são necessárias neste fluxo; se quiser preencher, use
     `https://pro-accounting.vercel.app` e `http://localhost:5173`.
4. Copie o **Client ID** e o **Client secret**. O secret vai **só** para o painel do Supabase — nunca
   para o código, para a Vercel nem para variáveis `VITE_`.

### 17.3 Supabase

O banco de produção foi criado pela integração da Vercel. Para abrir o painel dele: Vercel →
projeto **pro-accounting** → **Storage** → o banco → **Open in Supabase** (o endereço tem
`eqkzadyjebyrrhuysdoh`).

1. **Authentication → Sign In / Providers → Google:** ligue, cole o **Client ID** e o **Client secret**
   e salve. A *Callback URL* mostrada ali é a mesma do passo 3 acima.
2. **Authentication → URL Configuration:**
   - **Site URL:** `https://pro-accounting.vercel.app`
   - **Redirect URLs:**

     ```text
     https://pro-accounting.vercel.app/auth/callback
     http://localhost:5173/auth/callback
     http://localhost:8090/auth/callback
     ```

     Para deploys de pré-visualização da Vercel, acrescente também
     `https://pro-accounting-*-gabrielmaganha-dev-projects.vercel.app/**`.
     Quando houver domínio próprio, acrescente `https://<seu-domínio>/auth/callback` e troque o
     *Site URL* por ele.
3. **Authentication → Sign In / Providers → Email:** desligue *Allow new users to sign up*. O sistema
   não usa cadastro por e-mail do Supabase — e a API recusa qualquer identidade que não seja do Google.

### 17.4 Variáveis de ambiente

Só valores **públicos** — o endereço do projeto Supabase e a chave *anon/publishable*, feita para o
navegador. Nenhum segredo do Supabase (`service_role`, `JWT secret`) é usado.

| Onde | Variável | Para que serve |
| ---- | -------- | -------------- |
| API (`backend/.env`) | `SUPABASE_URL` | Endereço do projeto (`https://eqkzadyjebyrrhuysdoh.supabase.co`) |
| API (`backend/.env`) | `SUPABASE_ANON_KEY` | Chave pública (Supabase → Project Settings → API Keys) |
| Interface (`frontend/.env`) | `VITE_SUPABASE_URL` | O mesmo endereço |
| Interface (`frontend/.env`) | `VITE_SUPABASE_ANON_KEY` | A mesma chave pública |
| Docker (`.env.production`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY` | O compose repassa à API e ao build da interface |

**Na Vercel não é preciso cadastrar nada:** a integração com o Supabase já injeta o endereço e a chave
pública (com nomes como `STORAGE_SUPABASE_URL` e `STORAGE_SUPABASE_ANON_KEY`), que a API aceita e que
`scripts/vercel-build.mjs` repassa à interface. O log do build diz *"Login com Google: endereço e
chave pública do Supabase encontrados"*. Se disser que não encontrou, cadastre `SUPABASE_URL` e
`SUPABASE_ANON_KEY` em *Settings → Environment Variables* (Production) e faça um novo deploy.

Sem essas variáveis, o login com Google fica desligado e o restante do sistema funciona igual.

### 17.5 Testar

**Localmente:** preencha as quatro variáveis acima (backend e frontend), reinicie API e interface e
abra <http://localhost:5173/login>. O login com Google cria ou vincula a conta **no banco local**.

**Em produção:** depois dos passos 17.2 e 17.3, abra <https://pro-accounting.vercel.app/login>:

1. clique em **Continuar com Google** com uma conta que **não** está no sistema → "Cadastro recebido!
   Seu acesso está aguardando aprovação do administrador.";
2. entre como administrador → *Usuários* mostra "1 cadastro aguardando a sua aprovação" → **Aprovar
   acesso**;
3. **Continuar com Google** de novo → painel;
4. F5 → continua logado; **Sair** → volta ao login;
5. **Continuar com Google** com o e-mail do administrador → entra na **mesma** conta de administrador.

Os testes automatizados cobrem o resto: `npm test` no backend (vínculo, duplicidade, situações,
identidade recusada, Supabase fora do ar) e no frontend (botão, retorno, cancelamento, erros, sessão).

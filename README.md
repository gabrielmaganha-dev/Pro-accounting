# Pro Accounting — Sistema de Gestão Contábil

Sistema web para gestão de **clientes, contratos e faturas** de um escritório de contabilidade.

Fluxo central do sistema:

```
Cliente  →  Contrato  →  Faturas  →  Pagamento
```

> **Estado atual: módulo de Faturas no ar — o fluxo central está fechado.**
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
>   recebimento e situação das faturas, tabela do período e exportação em CSV.
>   **Restrito a administradores.**
> - **Painel** — indicadores, gráficos, alertas e atividade recente, todos com dados reais.
>
> As telas de Usuários e Configurações ainda são marcadores; entram na etapa seguinte.

---

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

---

## 1. Tecnologias

| Camada         | Tecnologia                                                                  |
| -------------- | --------------------------------------------------------------------------- |
| Frontend       | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, React Hook Form, Zod, Lucide |
| Backend        | Node.js 20+, TypeScript, Fastify 5, Zod                                     |
| Banco de dados | PostgreSQL 16+ (verificado com 18.6) + Prisma ORM                           |
| Autenticação   | JWT (`@fastify/jwt`) + hash de senha com bcrypt                             |
| Infra local    | Docker Compose (apenas o PostgreSQL)                                        |

**Duas escolhas que merecem explicação:**

- **Fastify em vez de Express** — conforme solicitado. Traz validação, logging estruturado (pino) e tipagem melhor por padrão.
- **`bcryptjs` em vez de `bcrypt`/`argon2`** — `bcrypt` e `argon2` são módulos nativos e exigem compilador C++ quando não há binário pronto para a plataforma. Em Windows sem o Visual Studio Build Tools, isso quebra o `npm install` com um erro difícil de diagnosticar. `bcryptjs` é JavaScript puro e instala em qualquer ambiente. Todo o hashing está isolado em `backend/src/utils/password.ts` — migrar para Argon2id depois é reescrever um arquivo só.

---

## 2. Estrutura do projeto

```text
pro-accounting/
├── docker-compose.yml          # PostgreSQL local
├── .env.example                # credenciais do banco (usado pelo compose)
├── package.json                # atalhos que chamam frontend e backend
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # modelo de dados
│   │   └── migrations/         # histórico versionado do banco
│   ├── .env.example
│   └── src/
│       ├── config/             # env validado + cliente Prisma
│       ├── controllers/        # entrada/saída HTTP
│       ├── services/           # regra de negócio
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
    ├── .env.example
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
        │   └── common/         # paginação, estado vazio, loader
        ├── contexts/           # estado de autenticação
        ├── hooks/
        ├── layouts/            # AppLayout, AuthLayout
        ├── lib/                # utilitários, query client, env
        ├── pages/
        │   ├── clients/        # lista, ficha e formulário
        │   ├── contracts/      # lista, ficha e formulário
        │   ├── invoices/       # lista, ficha e formulário
        │   └── payments/       # histórico de caixa (só leitura)
        ├── routes/             # mapa de rotas e guards
        ├── services/           # cliente HTTP e chamadas à API
        ├── types/
        └── utils/              # formatação pt-BR, máscaras
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
ADMIN_PASSWORD=UmaSenhaForte@2026
```

### Passo 6 — Preparar o banco de dados

#### Se você escolheu a Opção A (PostgreSQL instalado no Windows)

Crie o usuário e o banco da aplicação. Ajuste o caminho do `psql` para a sua versão e informe a
senha do usuário `postgres` quando solicitado:

```powershell
$psql = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

& $psql -U postgres -h localhost -c "CREATE ROLE pro_accounting WITH LOGIN PASSWORD 'proacc_dev_2026';"
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
$env:PGPASSWORD = "proacc_dev_2026"
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
| `CORS_ORIGIN`        | `http://localhost:5173`       | Origens autorizadas, separadas por vírgula            |
| `ADMIN_NAME`         | `Administrador`               | Usado só pelo seed                                    |
| `ADMIN_EMAIL`        | `admin@...`                   | Usado só pelo seed                                    |
| `ADMIN_PASSWORD`     | *(sua senha)*                 | Usado só pelo seed. Gravado com hash                  |

### `frontend/.env`

| Variável       | Exemplo                      | Para que serve            |
| -------------- | ---------------------------- | ------------------------- |
| `VITE_API_URL` | `http://localhost:3333/api`  | Endereço base da API      |

> **Atenção:** no Vite, toda variável `VITE_*` é embutida no JavaScript enviado ao navegador e fica visível para qualquer usuário. Nunca coloque segredo em variável `VITE_`.

---

## 7. Credenciais do administrador

**Não existem credenciais fixas no código.** O administrador é criado pelo seed a partir das variáveis de ambiente:

```dotenv
ADMIN_NAME="Seu Nome"
ADMIN_EMAIL=seuemail@proaccounting.com.br
ADMIN_PASSWORD=UmaSenhaForte@2026
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
curl -X POST http://localhost:3333/api/auth/login -H "Content-Type: application/json" -d '{\"email\":\"seuemail@proaccounting.com.br\",\"password\":\"UmaSenhaForte@2026\"}'
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
| `users`          | Acesso ao sistema. Perfis `ADMIN` e `EMPLOYEE`                      |
| `clients`        | Clientes do escritório. Situação `ACTIVE` / `INACTIVE`              |
| `client_history` | Auditoria do cadastro: o que mudou, quando e por quem               |
| `contracts`      | Contratos por cliente, com valor mensal e dia de vencimento         |
| `invoices`       | Faturas. Vinculadas a um cliente e, opcionalmente, a um contrato     |
| `invoice_history`| Auditoria da fatura: alterações, cancelamentos, pagamentos e estornos |
| `payments`       | Pagamentos de uma fatura, com registro de quem lançou               |

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
- **Situação de fatura não é aceita do cliente HTTP.** `status` é recusado no corpo da emissão e da edição — quem decide é o servidor, a partir da data, dos pagamentos e do cancelamento.
- **O consolidado financeiro é exclusivo do administrador**, em todas as três rotas `/api/finance/*`. O funcionário continua vendo o financeiro de cada cliente e contrato nas fichas; o que não vê é a soma do escritório.
- **Datas vão ao SQL como texto `YYYY-MM-DD`, nunca como `Date`.** A sessão do banco roda em `America/Sao_Paulo`, e um `Date` de meia-noite UTC convertido por `::date` retrocede um dia — o período perderia o dia corrente inteiro. Esta regra vale para todo raw query do projeto.
- **Teto de paginação** de 100 registros por página: sem ele, `?pageSize=999999` seria uma negação de serviço trivial contra o banco.
- **Validação de toda entrada** com Zod antes de tocar no banco.
- **SQL injection**: o Prisma monta consultas parametrizadas; não há concatenação de SQL no projeto.
- **CORS** com lista branca explícita — nunca `origin: true`.
- **Rate limit**: 300 req/min por IP no geral, 10/min em `/auth/login`.
- **Helmet** para cabeçalhos de segurança; corpo de requisição limitado a 1 MB.
- **Mensagem única** para e-mail inexistente e senha errada, com tempo de resposta equalizado. Distinguir os casos transformaria o login num verificador de quais e-mails existem.
- **Erros internos não vazam** stack trace nem detalhe de banco em produção.

**Ainda não implementado (planejado):**

- Refresh token com rotação em cookie `httpOnly`. Hoje o token de acesso fica no `localStorage` — prático, mas vulnerável a XSS. Todo o acesso ao token passa por `frontend/src/utils/storage.ts` justamente para que a troca seja local.
- Recuperação de senha por e-mail.
- Constraints `CHECK` no banco (`dueDay` entre 1 e 31, `amount > 0`, `endDate >= startDate`). Hoje essas regras são garantidas pela validação Zod na API.
- Auditoria de contratos — hoje existe para clientes e faturas.

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
| 7     | Financeiro: períodos, gráficos, tabela, exportação CSV                   | Concluída |
| 8     | Usuários, configurações, recuperação de senha, auditoria                 | A fazer  |

**Por que o painel veio antes dos contratos.** A ordem original previa o painel por
último. Ele foi antecipado porque os indicadores são o teste mais honesto do modelo de
dados: as consultas de faturamento, inadimplência e recebimento atravessam as cinco
tabelas de uma vez e revelam cedo qualquer erro de modelagem — enquanto corrigi-lo ainda
é barato. O painel já lê dados reais; a tela **Financeiro**, com fluxo de caixa por
período, continua na etapa 5b.

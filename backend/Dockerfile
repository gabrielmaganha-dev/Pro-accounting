# syntax=docker/dockerfile:1.7
# =============================================================================
# Pro Accounting — API (imagem de produção)
# =============================================================================
# Três estágios. Só o último vira a imagem publicada; os dois primeiros existem
# para que o compilador, os tipos e as ferramentas de desenvolvimento não
# cheguem ao servidor — é menos megabyte para baixar e menos código de terceiros
# rodando onde estão os dados financeiros.
#
#   build      instala tudo, gera o cliente do Prisma e compila o TypeScript
#   prod-deps  instala SÓ as dependências de produção e gera o cliente de novo
#   runtime    recebe node_modules de prod-deps e o JavaScript de build
#
# Construir:  docker build -t pro-accounting-api ./backend
# =============================================================================

# Mesma linha de Node usada no desenvolvimento. Alpine: imagem pequena.
ARG NODE_VERSION=24-alpine


# --- 1. build ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

# O motor de consulta do Prisma liga-se à libssl do sistema; sem o pacote ele
# não identifica a plataforma e baixa o binário errado.
RUN apk add --no-cache openssl

# Manifestos primeiro: enquanto package.json e o lock não mudarem, o Docker
# reaproveita a camada do `npm ci` e o rebuild após editar código leva segundos.
COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
# `tsc` direto, e não `npm run build`: o script também roda `prisma generate`,
# que já foi feito na camada acima.
RUN npx tsc -p tsconfig.json


# --- 2. dependências de produção ---------------------------------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
# --omit=dev deixa de fora TypeScript, ESLint, tsx e pino-pretty. O CLI do
# Prisma fica: está em `dependencies` de propósito, porque é ele que aplica as
# migrations no servidor (`prisma migrate deploy`).
RUN npm ci --omit=dev && npm cache clean --force

# O cliente gerado mora dentro de node_modules, então precisa ser gerado
# NESTA árvore — a do estágio de build é outra e não é copiada.
COPY prisma ./prisma
RUN npx prisma generate


# --- 3. runtime --------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime

# NODE_ENV=production é o que desliga as mensagens de erro detalhadas, liga a
# validação rígida de segredos (src/config/env.ts) e troca o log para JSON.
ENV NODE_ENV=production \
    PORT=3333 \
    HOST=0.0.0.0

# Sem telemetria nem checagem de versão do Prisma: o container de produção não
# deve fazer chamada de rede que ninguém pediu.
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

WORKDIR /app
RUN apk add --no-cache openssl

# --chown: os arquivos pertencem ao usuário sem privilégios que roda o processo.
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build     --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# O schema e as migrations vão junto: `prisma migrate deploy` lê os dois.
COPY --chown=node:node prisma ./prisma

# Nunca como root. A imagem oficial do Node já traz o usuário `node` (uid 1000).
USER node

EXPOSE 3333

# Verificação de saúde feita com o próprio Node — a imagem não tem curl, e
# instalar um só para isto seria mais superfície à toa. A rota executa um
# SELECT 1: "saudável" significa processo no ar E banco respondendo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Forma "exec" (colchetes): o Node vira o processo 1 e recebe o SIGTERM do
# `docker stop` direto — é o que aciona o desligamento ordenado de server.ts.
# Com `npm start`, o sinal pararia no npm e o container seria morto à força.
CMD ["node", "dist/server.js"]

# syntax=docker/dockerfile:1.7
# =============================================================================
# Pro Accounting — Interface (imagem de produção)
# =============================================================================
# Dois estágios: o primeiro compila a interface com Node; o segundo é só um
# nginx servindo os arquivos estáticos resultantes. Node, código-fonte e
# node_modules ficam no primeiro e não chegam à imagem publicada.
#
# O mesmo nginx repassa `/api` ao backend, então interface e API saem pelo
# MESMO endereço — sem requisição entre origens e com um certificado só.
#
# Construir:  docker build -t pro-accounting-web ./frontend
# =============================================================================

ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=1.30-alpine


# --- 1. build ----------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_* é embutida no JavaScript NESTE momento — não existe como mudar depois,
# em tempo de execução. O padrão `/api` (relativo) funciona em qualquer domínio
# porque o nginx abaixo entrega a API no mesmo endereço da interface.
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

# Confere os tipos e gera dist/ (ver "build" em package.json).
RUN npm run build


# --- 2. runtime --------------------------------------------------------------
# Variante "unprivileged": o nginx inteiro roda como usuário comum (uid 101) e
# escuta na 8080, em vez de subir como root para abrir a porta 80.
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime

# Cabeçalhos de segurança, incluídos pelas rotas que servem a interface.
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

# Modelo da configuração. Na subida do container a imagem troca as variáveis
# abaixo pelos valores do ambiente e grava o resultado em
# /etc/nginx/conf.d/default.conf.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

#   API_UPSTREAM        onde está a API — `backend:3333` é o nome do serviço no
#                       docker-compose.production.yml
#   NGINX_RESOLVER      DNS que resolve esse nome — 127.0.0.11 é o DNS interno
#                       das redes do Docker
#   TRUSTED_PROXY_CIDR  de quem aceitar o cabeçalho X-Forwarded-For. O padrão
#                       não confia em ninguém de fora do container
ENV API_UPSTREAM=backend:3333 \
    NGINX_RESOLVER=127.0.0.11 \
    TRUSTED_PROXY_CIDR=127.0.0.1/32

EXPOSE 8080

# /healthz responde do próprio nginx, sem tocar na API: diz se a INTERFACE está
# no ar. A saúde da API tem verificação própria, no container dela.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

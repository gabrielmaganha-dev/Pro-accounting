#!/bin/sh
# =============================================================================
# Pro Accounting — teste de fumaça de uma instalação
# =============================================================================
# Confere, de fora, o que precisa estar certo depois de um deploy: a interface
# responde, a API responde, o banco está ligado, o login funciona, rotas
# protegidas exigem token, o CORS recusa origem estranha, erros não vazam
# detalhe interno e os cabeçalhos de segurança estão lá.
#
# Só LÊ: faz login e consultas. Não cria, altera nem apaga nada.
#
# Uso:
#
#   sh scripts/smoke-test.sh <URL base> [e-mail] [senha]
#
#   sh scripts/smoke-test.sh https://app.suaempresa.com.br admin@empresa.com 'senha'
#   sh scripts/smoke-test.sh http://localhost            # sem login: só o que é público
#
# Variáveis opcionais:
#   SMOKE_INSECURE=1   aceita certificado não confiável (teste local com Caddy)
#
# Sai com código 0 se tudo passar, 1 se algo falhar.
# =============================================================================
set -u

BASE="${1:-}"
EMAIL="${2:-}"
PASSWORD="${3:-}"

if [ -z "$BASE" ]; then
  echo "Uso: sh scripts/smoke-test.sh <URL base> [e-mail] [senha]" >&2
  exit 2
fi

BASE="${BASE%/}"
API="$BASE/api"
CURL="curl --silent --show-error --max-time 20"
[ "${SMOKE_INSECURE:-0}" = "1" ] && CURL="$CURL --insecure"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

passed=0
failed=0

ok()   { passed=$((passed + 1)); printf '  PASSOU  %s\n' "$1"; }
fail() { failed=$((failed + 1)); printf '  FALHOU  %s\n          %s\n' "$1" "$2"; }

# check "<descrição>" "<esperado>" "<obtido>"
check() {
  if [ "$2" = "$3" ]; then ok "$1"; else fail "$1" "esperado: $2 | obtido: $3"; fi
}

# has "<descrição>" "<trecho>" "<arquivo>"   (sem diferenciar maiúsculas)
has() {
  if grep -qi -- "$2" "$3"; then ok "$1"; else fail "$1" "não encontrado: $2"; fi
}

# hasnt "<descrição>" "<trecho>" "<arquivo>"
hasnt() {
  if grep -qi -- "$2" "$3"; then fail "$1" "não deveria conter: $2"; else ok "$1"; fi
}

# status "<url>" [args do curl...]  → imprime só o código HTTP
status() {
  url="$1"; shift
  $CURL --output /dev/null --write-out '%{http_code}' "$@" "$url" 2>/dev/null || echo "000"
}

echo ""
echo "Teste de fumaça: $BASE"
echo ""

# --- Interface ---------------------------------------------------------------
echo "Interface"
$CURL --dump-header "$TMP/index.h" --output "$TMP/index.html" "$BASE/" || true
check "página inicial responde 200" "200" "$(awk 'NR==1{print $2}' "$TMP/index.h" 2>/dev/null)"
has   "entrega o HTML da aplicação" '<div id="root">' "$TMP/index.html"
has   "index.html não fica em cache" 'cache-control: no-cache' "$TMP/index.h"
has   "Content-Security-Policy presente" 'content-security-policy:' "$TMP/index.h"
has   "CSP bloqueia script de terceiros" "script-src 'self'" "$TMP/index.h"
has   "X-Content-Type-Options: nosniff" 'x-content-type-options: nosniff' "$TMP/index.h"
has   "bloqueio de iframe" 'x-frame-options: DENY' "$TMP/index.h"
hasnt "não anuncia a versão do servidor" '^server: nginx/' "$TMP/index.h"
hasnt "build não aponta para localhost" 'localhost:3333' "$TMP/index.html"

case "$BASE" in
  https://*) has "HSTS presente (HTTPS)" 'strict-transport-security:' "$TMP/index.h" ;;
esac

check "rota da interface cai no index.html" "200" "$(status "$BASE/clientes/qualquer-coisa")"

# Primeiro arquivo .js referenciado pelo index.html
asset="$(grep -o '/assets/[A-Za-z0-9._-]*\.js' "$TMP/index.html" | head -n 1)"
if [ -n "$asset" ]; then
  $CURL --dump-header "$TMP/asset.h" --output /dev/null "$BASE$asset" || true
  check "arquivo JS do build responde 200" "200" "$(awk 'NR==1{print $2}' "$TMP/asset.h" 2>/dev/null)"
  has   "arquivos com hash têm cache longo" 'max-age=31536000' "$TMP/asset.h"
  check "source map não é publicado" "404" "$(status "$BASE$asset.map")"
else
  fail "arquivo JS do build" "nenhum /assets/*.js no index.html"
fi

check "asset inexistente é 404 (não o index.html)" "404" "$(status "$BASE/assets/nao-existe-abc123.js")"

# --- API ---------------------------------------------------------------------
echo ""
echo "API"
$CURL --dump-header "$TMP/health.h" --output "$TMP/health.json" "$API/health" || true
check "health check responde 200" "200" "$(awk 'NR==1{print $2}' "$TMP/health.h" 2>/dev/null)"
has   "banco de dados conectado" '"database":"connected"' "$TMP/health.json"
has   "API em modo produção" '"environment":"production"' "$TMP/health.json"
has   "respostas da API não ficam em cache" 'cache-control: no-store' "$TMP/health.h"
has   "API envia X-Content-Type-Options" 'x-content-type-options: nosniff' "$TMP/health.h"

check "rota protegida sem token é 401" "401" "$(status "$API/clients")"
check "token inválido é 401" "401" "$(status "$API/clients" --header 'Authorization: Bearer abc.def.ghi')"

$CURL --output "$TMP/404.json" "$API/rota-que-nao-existe" || true
check "rota inexistente é 404" "404" "$(status "$API/rota-que-nao-existe")"
has   "404 vem no envelope de erro da API" '"success":false' "$TMP/404.json"

# JSON quebrado: tem de ser 400 com mensagem para o usuário, sem pilha de erro.
$CURL --output "$TMP/bad.json" --request POST --header 'Content-Type: application/json' \
  --data '{"email": ' "$API/auth/login" || true
hasnt "erro não vaza pilha de execução" 'at .*\.js:' "$TMP/bad.json"
hasnt "erro não vaza detalhe do banco" 'prisma' "$TMP/bad.json"

# --- CORS --------------------------------------------------------------------
echo ""
echo "CORS"
$CURL --dump-header "$TMP/cors-bad.h" --output /dev/null --request OPTIONS \
  --header 'Origin: https://site-malicioso.example' \
  --header 'Access-Control-Request-Method: POST' "$API/auth/login" || true
hasnt "origem desconhecida não é autorizada" 'access-control-allow-origin: https://site-malicioso.example' "$TMP/cors-bad.h"
hasnt "CORS não usa curinga" 'access-control-allow-origin: \*' "$TMP/cors-bad.h"

$CURL --dump-header "$TMP/cors-ok.h" --output /dev/null --request OPTIONS \
  --header "Origin: $BASE" \
  --header 'Access-Control-Request-Method: POST' "$API/auth/login" || true
has "a própria origem é autorizada" "access-control-allow-origin: $BASE" "$TMP/cors-ok.h"

# --- Login -------------------------------------------------------------------
echo ""
echo "Autenticação"
check "senha errada é 401" "401" "$(status "$API/auth/login" --request POST \
  --header 'Content-Type: application/json' \
  --data '{"email":"ninguem@exemplo.invalid","password":"senha-errada-123"}')"

if [ -n "$EMAIL" ] && [ -n "$PASSWORD" ]; then
  # O corpo é montado num arquivo para não passar a senha pela linha de comando
  # do curl (onde apareceria na lista de processos da máquina).
  printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD" > "$TMP/login-body.json"
  $CURL --output "$TMP/login.json" --request POST --header 'Content-Type: application/json' \
    --data "@$TMP/login-body.json" "$API/auth/login" || true
  rm -f "$TMP/login-body.json"

  token="$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' "$TMP/login.json" | head -n 1)"

  if [ -n "$token" ]; then
    ok "login devolve um token"
    hasnt "login não devolve a senha nem o hash" '"password"' "$TMP/login.json"

    auth="Authorization: Bearer $token"
    check "sessão válida em /auth/me" "200" "$(status "$API/auth/me" --header "$auth")"
    check "painel carrega com o token" "200" "$(status "$API/dashboard" --header "$auth")"
    check "lista de clientes carrega" "200" "$(status "$API/clients?page=1&pageSize=5" --header "$auth")"
    check "lista de faturas carrega" "200" "$(status "$API/invoices?page=1&pageSize=5" --header "$auth")"
    check "teto de paginação é aplicado" "422" "$(status "$API/clients?pageSize=999999" --header "$auth")"
  else
    fail "login devolve um token" "resposta sem token — confira e-mail e senha"
  fi
else
  echo "  (sem e-mail e senha: testes autenticados não executados)"
fi

# --- Resultado ---------------------------------------------------------------
echo ""
echo "$passed passaram, $failed falharam"
echo ""
[ "$failed" -eq 0 ]

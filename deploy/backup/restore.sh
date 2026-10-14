#!/bin/sh
# =============================================================================
# Pro Accounting — restauração do banco a partir de um backup
# =============================================================================
# Uso:
#
#   sh restore.sh <arquivo.dump>            pede confirmação
#   sh restore.sh <arquivo.dump> --yes      sem pergunta (automação)
#
# No compose de produção (pare a API antes, para ninguém gravar durante a troca):
#
#   docker compose ... stop backend
#   docker compose ... exec backup sh /scripts/restore.sh /backups/<arquivo>.dump
#   docker compose ... start backend
#
# COMO FUNCIONA — e por que não restaura por cima do banco em uso:
#
#   1. cria um banco NOVO, vazio, e restaura o backup nele;
#   2. confere que a restauração trouxe as tabelas do sistema;
#   3. só então troca os nomes: o banco atual vira <banco>_antes_<data> e o
#      restaurado assume o nome oficial.
#
# Restaurar direto sobre o banco em produção apaga os dados atuais ANTES de
# saber se o backup está inteiro: um arquivo corrompido deixaria o sistema sem
# banco nenhum. Aqui, se qualquer passo falhar, o banco atual continua intacto
# — e, depois da troca, o anterior fica guardado até você decidir apagá-lo.
#
# A conexão vem de PGHOST, PGPORT, PGUSER, PGPASSWORD e PGDATABASE. O usuário
# precisa poder criar bancos (no compose de produção, pode).
# =============================================================================
set -eu

file="${1:-}"
confirm="${2:-}"

: "${PGDATABASE:?defina PGDATABASE}"

if [ -z "$file" ]; then
  echo "Uso: sh restore.sh <arquivo.dump> [--yes]" >&2
  echo "" >&2
  echo "Backups disponíveis em ${BACKUP_DIR:-/backups}:" >&2
  ls -1t "${BACKUP_DIR:-/backups}"/*.dump 2>/dev/null | head -10 >&2 || echo "  (nenhum)" >&2
  exit 2
fi

if [ ! -f "$file" ]; then
  echo "[restore] arquivo não encontrado: $file" >&2
  exit 2
fi

# --- Integridade -------------------------------------------------------------
if [ -f "$file.sha256" ]; then
  if ( cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256" > /dev/null 2>&1 ); then
    echo "[restore] soma de verificação confere"
  else
    echo "[restore] a soma de verificação NÃO confere: o arquivo foi alterado ou está corrompido." >&2
    exit 1
  fi
else
  echo "[restore] aviso: sem arquivo .sha256 ao lado do backup; integridade não conferida"
fi

# Lê o índice inteiro do dump: falha aqui se o arquivo estiver truncado.
pg_restore --list "$file" > /dev/null

target="$PGDATABASE"
stamp="$(date +%Y%m%d_%H%M%S)"
staging="${target}_restaurando_${stamp}"
previous="${target}_antes_${stamp}"

if [ "$confirm" != "--yes" ]; then
  echo ""
  echo "  Banco:   $target  (em ${PGHOST:-localhost})"
  echo "  Backup:  $(basename "$file")"
  echo ""
  echo "  O conteúdo ATUAL de \"$target\" será substituído pelo do backup."
  echo "  O banco atual não é apagado: fica guardado como \"$previous\"."
  echo ""
  printf "  Digite o nome do banco para confirmar: "
  read -r answer
  if [ "$answer" != "$target" ]; then
    echo "[restore] cancelado."
    exit 1
  fi
fi

# Comandos administrativos rodam conectados ao banco de manutenção `postgres`:
# não dá para renomear um banco estando conectado a ele.
admin() {
  psql --dbname=postgres --no-psqlrc --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 "$@"
}

cleanup() {
  # Só chega aqui com o staging ainda existindo se algo falhou antes da troca.
  admin -c "DROP DATABASE IF EXISTS \"$staging\"" > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[restore] 1/3 restaurando o backup em um banco temporário ($staging)"
admin -c "CREATE DATABASE \"$staging\""

# --exit-on-error      para no primeiro erro, em vez de seguir com dado faltando
# --single-transaction tudo ou nada dentro do banco temporário
pg_restore \
  --dbname="$staging" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --single-transaction \
  "$file"

echo "[restore] 2/3 conferindo o banco restaurado"
tables="$(psql --dbname="$staging" --no-psqlrc --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
migrations="$(psql --dbname="$staging" --no-psqlrc --quiet --tuples-only --no-align -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL" 2>/dev/null || echo 0)"

if [ "${tables:-0}" -lt 5 ] || [ "${migrations:-0}" -lt 1 ]; then
  echo "[restore] o backup restaurou $tables tabela(s) e $migrations migration(s): não parece um banco do sistema. Nada foi trocado." >&2
  exit 1
fi
echo "[restore]     $tables tabelas, $migrations migrations aplicadas"

echo "[restore] 3/3 trocando o banco em uso pelo restaurado"
# Encerra as conexões que restarem (a API deveria estar parada) e troca os
# nomes. O banco atual só é renomeado — nunca apagado — por este script.
admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$target' AND pid <> pg_backend_pid()" > /dev/null

if [ "$(admin -c "SELECT count(*) FROM pg_database WHERE datname = '$target'")" = "1" ]; then
  admin -c "ALTER DATABASE \"$target\" RENAME TO \"$previous\""
  kept=1
else
  kept=0
fi

if ! admin -c "ALTER DATABASE \"$staging\" RENAME TO \"$target\""; then
  # Devolve o nome ao banco original para não deixar o sistema sem banco.
  [ "$kept" = "1" ] && admin -c "ALTER DATABASE \"$previous\" RENAME TO \"$target\""
  echo "[restore] falha ao ativar o banco restaurado; o banco original foi mantido." >&2
  exit 1
fi

trap - EXIT

echo "[restore] concluído: \"$target\" agora tem o conteúdo de $(basename "$file")"
if [ "$kept" = "1" ]; then
  echo "[restore] o banco anterior ficou guardado como \"$previous\"."
  echo "[restore] depois de conferir o sistema, apague-o com:"
  echo "            psql -d postgres -c 'DROP DATABASE \"$previous\"'"
fi

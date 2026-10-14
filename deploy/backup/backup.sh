#!/bin/sh
# =============================================================================
# Pro Accounting — backup do banco (pg_dump)
# =============================================================================
# Gera um arquivo por execução em $BACKUP_DIR:
#
#   <banco>-AAAAMMDD-HHMMSS.dump          o backup (formato "custom", comprimido)
#   <banco>-AAAAMMDD-HHMMSS.dump.sha256   soma de verificação
#
# e apaga os mais antigos que $BACKUP_RETENTION_DAYS dias.
#
# A conexão vem das variáveis padrão do PostgreSQL: PGHOST, PGPORT, PGUSER,
# PGPASSWORD e PGDATABASE. No compose de produção o serviço `backup` já as
# define, então para um backup avulso basta:
#
#   docker compose --env-file .env.production -f docker-compose.production.yml \
#     exec backup sh /scripts/backup.sh
#
# Fora do Docker funciona igual, com as variáveis exportadas no terminal.
# =============================================================================
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

: "${PGDATABASE:?defina PGDATABASE}"

mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
file="$BACKUP_DIR/${PGDATABASE}-${stamp}.dump"
partial="$file.partial"

# Um backup interrompido não pode ficar com cara de backup pronto.
trap 'rm -f "$partial"' EXIT

echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') iniciando: $PGDATABASE"

# --format=custom   comprimido, e permite restaurar uma tabela só se preciso
# --no-owner        o arquivo restaura em qualquer servidor, com qualquer
# --no-privileges   usuário — não depende de existir um papel com o mesmo nome
pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$partial"

# Um arquivo que não abre não é backup. `pg_restore --list` lê o índice inteiro
# do dump: se estiver truncado ou corrompido, falha AQUI, e não no dia em que
# alguém precisar restaurar.
pg_restore --list "$partial" > /dev/null

mv "$partial" "$file"
trap - EXIT

# Soma de verificação, para conferir a integridade depois de copiar o arquivo
# para outro lugar:  sha256sum -c <arquivo>.sha256
( cd "$BACKUP_DIR" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256" )

size="$(du -h "$file" | cut -f1)"
echo "[backup] concluído: $(basename "$file") ($size)"

# --- Retenção ----------------------------------------------------------------
# Só arquivos DESTE banco, e só depois de o backup novo estar gravado e
# validado: se o de hoje tivesse falhado, o script já teria parado lá em cima e
# nenhum antigo seria apagado.
removed="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PGDATABASE}-*.dump" -mtime "+${RETENTION_DAYS}" -print | wc -l | tr -d ' ')"

if [ "$removed" -gt 0 ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \
    \( -name "${PGDATABASE}-*.dump" -o -name "${PGDATABASE}-*.dump.sha256" \) \
    -mtime "+${RETENTION_DAYS}" -delete
  echo "[backup] retenção: $removed backup(s) com mais de ${RETENTION_DAYS} dias removido(s)"
fi

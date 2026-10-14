#!/bin/sh
# =============================================================================
# Pro Accounting — agendador de backup (processo do serviço `backup`)
# =============================================================================
# Faz um backup ao subir e outro a cada BACKUP_INTERVAL_HOURS.
#
# Um laço com `sleep` em vez de cron: é um processo só, o log sai direto na
# saída do container (`docker compose logs backup`) e não há daemon nem crontab
# para configurar dentro da imagem.
#
# O backup ao subir garante que exista ao menos um desde o primeiro minuto. Ele
# NÃO substitui o backup avulso antes de uma atualização: este serviço e o das
# migrations sobem ao mesmo tempo, sem ordem garantida entre os dois (README,
# seção 16.8).
# =============================================================================
set -u

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"

echo "[backup] agendador ativo: a cada ${INTERVAL_HOURS}h, retenção de ${BACKUP_RETENTION_DAYS:-14} dias, em ${BACKUP_DIR:-/backups}"

while true; do
  # Uma falha (banco reiniciando, disco cheio) é registrada e o laço segue:
  # o agendador não pode morrer por causa de uma execução ruim.
  if ! sh /scripts/backup.sh; then
    echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') FALHOU — nova tentativa no próximo ciclo" >&2
  fi

  # `sleep` em segundo plano + `wait`: o shell responde na hora ao SIGTERM do
  # `docker stop`, em vez de segurar o desligamento até o sleep acabar.
  sleep "$((INTERVAL_HOURS * 3600))" &
  wait $!
done

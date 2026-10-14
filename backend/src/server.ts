import { buildApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/prisma.js';
import { loadSettingsIntoRuntime } from './services/settings.service.js';

/**
 * Ponto de entrada do processo: conecta ao banco, abre a porta e trata o
 * desligamento. Toda a montagem da aplicação vive em `app.ts`.
 */
async function bootstrap(): Promise<void> {
  const app = await buildApp();

  // Falha cedo: é melhor não subir do que aceitar requisições e devolver erro
  // 500 em todas elas porque o banco não estava no ar.
  try {
    await connectDatabase();
    app.log.info('PostgreSQL conectado.');
  } catch (error) {
    app.log.error(
      { err: error },
      'Não foi possível conectar ao PostgreSQL. Verifique se o container está no ar ' +
        '(docker compose up -d) e se DATABASE_URL em backend/.env está correta.',
    );
    process.exit(1);
  }

  /**
   * Carrega a configuração do sistema para a memória.
   *
   * Depois da conexão e ANTES de abrir a porta: fuso horário e antecedência de
   * vencimento são lidos em código síncrono espalhado por todos os módulos, e
   * a primeira requisição não pode pegar os padrões por meio segundo e devolver
   * um "hoje" diferente do resto do dia.
   */
  await loadSettingsIntoRuntime();
  app.log.info('Configuração do sistema carregada.');

  // Aviso, não erro: uma intranet sem TLS é uma instalação legítima. Mas quem
  // publicou o sistema na internet por HTTP precisa ver isto a cada subida —
  // senha e token trafegam em texto puro.
  if (env.isProduction) {
    const insecure = env.corsOrigins.filter(
      (origin) => origin.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(origin),
    );

    if (insecure.length > 0) {
      app.log.warn(
        { origins: insecure },
        'CORS_ORIGIN inclui endereço sem HTTPS. Em rede pública, senhas e tokens trafegam sem criptografia.',
      );
    }
  }

  /**
   * Desligamento ordenado: para de aceitar novas conexões, espera as em
   * andamento terminarem e só então fecha o pool do Prisma. Sem isto, um
   * Ctrl+C no meio de uma gravação pode deixar a transação pendurada.
   */
  let shuttingDown = false;

  /**
   * Teto para o desligamento ordenado.
   *
   * `app.close()` espera as requisições em andamento — e uma conexão presa
   * (cliente que sumiu sem fechar o socket) faria essa espera durar para
   * sempre. O Docker dá 10 segundos entre o SIGTERM e o SIGKILL; saindo por
   * conta própria antes disso, o processo ainda consegue registrar o motivo.
   */
  const SHUTDOWN_TIMEOUT_MS = 8_000;

  /** `exitCode` 1 quando o desligamento é consequência de uma falha. */
  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    app.log.info(`Sinal ${signal} recebido. Encerrando...`);

    const forceExit = setTimeout(() => {
      app.log.error('Desligamento ordenado não terminou a tempo. Encerrando à força.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    // Não deixa o próprio temporizador segurar o processo vivo.
    forceExit.unref();

    try {
      await app.close();
      await disconnectDatabase();
      app.log.info('Encerrado com sucesso.');
      process.exit(exitCode);
    } catch (error) {
      app.log.error({ err: error }, 'Falha ao encerrar.');
      process.exit(1);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  // Uma promise rejeitada sem catch deixaria o processo num estado
  // indeterminado; preferimos registrar e morrer para o supervisor reiniciar.
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Promise rejeitada sem tratamento.');
    void shutdown('unhandledRejection', 1);
  });

  // Mesma política para exceção síncrona que escapou de todo `try`: depois
  // dela o estado do processo não é confiável. Registra e sai com código de
  // erro, para o supervisor (`restart: unless-stopped`) subir um processo limpo.
  process.on('uncaughtException', (error) => {
    app.log.fatal({ err: error }, 'Exceção não capturada.');
    void shutdown('uncaughtException', 1);
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`API disponível em http://localhost:${env.PORT}/api`);
    app.log.info(`Health check:     http://localhost:${env.PORT}/api/health`);
  } catch (error) {
    app.log.error({ err: error }, `Não foi possível abrir a porta ${env.PORT}.`);
    process.exit(1);
  }
}

void bootstrap();

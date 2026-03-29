import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { optionalEnv, requiredEnv } from './config/env';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { Logger } from '@nestjs/common';

const MAX_PORT_ATTEMPTS = 3;
const DEV_WEB_PORTS = new Set(['8081', '19006', '19000']);

function isAddrInUseError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as any).code === 'EADDRINUSE'
  );
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

function isPrivateIpv4Host(host: string): boolean {
  const parts = host.split('.').map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  if (parts[0] === 10) {
    return true;
  }

  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }

  return parts[0] === 192 && parts[1] === 168;
}

function isAllowedDevOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    const port =
      parsed.port ||
      (parsed.protocol === 'http:' ? '80' : parsed.protocol === 'https:' ? '443' : '');

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    if (!DEV_WEB_PORTS.has(port)) {
      return false;
    }

    return isLoopbackHost(host) || isPrivateIpv4Host(host);
  } catch {
    return false;
  }
}

async function listenWithFallback(
  app: Awaited<ReturnType<typeof NestFactory.create>>,
  logger: Logger,
  preferredPort: number,
) {
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
    const candidatePort = preferredPort + attempt;
    try {
      await app.listen(candidatePort, '0.0.0.0');
      if (attempt > 0) {
        logger.warn(
          `Backend started on fallback port ${candidatePort} (preferred ${preferredPort} was unavailable).`,
        );
      }
      return candidatePort;
    } catch (error) {
      if (isAddrInUseError(error)) {
        logger.error(
          `Port ${candidatePort} is already in use. Stop the other process or set PORT=${candidatePort + 1}.`,
        );
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Could not bind backend to any port in range ${preferredPort}-${
      preferredPort + MAX_PORT_ATTEMPTS - 1
    }.`,
  );
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());

  const hostWebOrigin = optionalEnv('HOST_WEB_ORIGIN');
  const playerAppOrigin = optionalEnv('PLAYER_APP_ORIGIN');
  const configuredOrigins = [hostWebOrigin, playerAppOrigin]
    .filter(Boolean)
    .map((origin) => String(origin).toLowerCase());
  const isDev = process.env.NODE_ENV !== 'production';
  const devOrigins = [
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
    'http://localhost:19000',
    'http://127.0.0.1:19000',
  ];
  const allowedOrigins = [...new Set([...configuredOrigins, ...(isDev ? devOrigins : [])])];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.toLowerCase();
      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      if (isDev && isAllowedDevOrigin(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

  const preferredPort = Number(process.env.PORT ?? 3000);
  const allowPortFallback = process.env.ALLOW_PORT_FALLBACK === '1';
  let boundPort = preferredPort;

  if (allowPortFallback) {
    boundPort = await listenWithFallback(app, logger, preferredPort);
  } else {
    try {
      await app.listen(preferredPort, '0.0.0.0');
    } catch (error) {
      if (isAddrInUseError(error)) {
        logger.error(
          `Port ${preferredPort} is already in use. Stop the other process or set PORT=${preferredPort + 1}.`,
        );
      }
      throw error;
    }
  }

  if (isDev) {
    const mobileRedirect = requiredEnv('SPOTIFY_REDIRECT_URI');
    const webRedirect = optionalEnv('SPOTIFY_REDIRECT_URI_WEB') ?? '<not-set>';
    logger.log(`Backend listening on port ${boundPort}`);
    logger.log(`ALLOW_PORT_FALLBACK: ${allowPortFallback ? '1' : '0'}`);
    logger.log(`CORS ENABLED ORIGINS: ${allowedOrigins.join(', ') || '<none>'}`);
    logger.log(`Spotify redirect (mobile): ${mobileRedirect}`);
    logger.log(`Spotify redirect (web): ${webRedirect}`);
    logger.log(`HOST_WEB_ORIGIN: ${hostWebOrigin ?? '<not-set>'}`);
  }
}
bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    `Backend startup failed: ${(error as Error)?.message ?? 'Unknown error'}`,
  );
  process.exit(1);
});


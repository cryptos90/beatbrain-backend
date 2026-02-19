import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { optionalEnv, requiredEnv } from './config/env';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { Logger } from '@nestjs/common';

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
    'http://192.168.2.237:8081',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
    'http://localhost:19000',
    'http://127.0.0.1:19000',
  ];
  const allowedOrigins = [...new Set([...configuredOrigins, ...(isDev ? devOrigins : [])])];

  const isAllowedLocalWebOrigin = (origin: string) => {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname.toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
      return false;
    }
  };

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

      if (isDev && isAllowedLocalWebOrigin(normalizedOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  if (isDev) {
    const mobileRedirect = requiredEnv('SPOTIFY_REDIRECT_URI');
    const webRedirect = optionalEnv('SPOTIFY_REDIRECT_URI_WEB') ?? '<not-set>';
    logger.log(`CORS ENABLED ORIGINS: ${allowedOrigins.join(', ') || '<none>'}`);
    logger.log(`Spotify redirect (mobile): ${mobileRedirect}`);
    logger.log(`Spotify redirect (web): ${webRedirect}`);
    logger.log(`HOST_WEB_ORIGIN: ${hostWebOrigin ?? '<not-set>'}`);
  }
}
bootstrap();

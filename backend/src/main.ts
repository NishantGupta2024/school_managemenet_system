import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // HTTP Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Avoid breaking React/Vite development or inline previews until explicit CSP directives are tested
      crossOriginEmbedderPolicy: false,
    }),
  );

  const port = process.env.PORT || 3000;
  const apiPrefix = process.env.API_PREFIX || '/api/v1';
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

  // Global API Prefix
  app.setGlobalPrefix(apiPrefix.replace(/^\//, ''));

  // CORS Configuration
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = isProduction
    ? corsOrigin.split(',').map((o) => o.trim())
    : [corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-school-id',
      'idempotency-key',
      'Idempotency-Key',
    ],
    exposedHeaders: [
      'x-school-id',
      'Content-Disposition',
      'idempotency-key',
      'Idempotency-Key',
    ],
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Enable NestJS shutdown lifecycle handling (SIGTERM, SIGINT)
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Fee Management Backend running at http://localhost:${port}/${apiPrefix.replace(/^\//, '')}`);
}

bootstrap();

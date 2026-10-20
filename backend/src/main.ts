import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT || 3000;
  const apiPrefix = process.env.API_PREFIX || '/api/v1';
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';

  // Global API Prefix
  app.setGlobalPrefix(apiPrefix.replace(/^\//, ''));

  // CORS Configuration
  app.enableCors({
    origin: [corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-school-id'],
    exposedHeaders: ['x-school-id', 'Content-Disposition'],
  });

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(port);
  logger.log(`Fee Management Backend running at http://localhost:${port}/${apiPrefix.replace(/^\//, '')}`);
}

bootstrap();

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { IdempotencyService } from './common/services/idempotency.service';
import { json, urlencoded } from 'express';

function corsOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allowed?: boolean) => void,
) {
  // Requests made without an Origin header (for example curl and server-to-server
  // calls) do not need browser CORS protection.
  if (!origin) {
    callback(null, true);
    return;
  }

  const configuredOrigins = process.env.WEB_ORIGIN?.split(',') ?? [
    'http://localhost:3000',
  ];
  const isConfiguredOrigin = configuredOrigins.includes(origin);
  const isLocalDevelopmentOrigin =
    process.env.NODE_ENV !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);

  callback(null, isConfiguredOrigin || isLocalDevelopmentOrigin);
}

loadEnv({
  path: resolve(__dirname, '../.env'),
  override: true,
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true,
  });
  // Images are persisted to disk as short media URLs; keep JSON bodies modest.
  const maxPayloadBytes = '8mb';
  app.useBodyParser('json', { limit: maxPayloadBytes });
  app.useBodyParser('urlencoded', { limit: maxPayloadBytes, extended: true });
  app.use(json({ limit: maxPayloadBytes }));
  app.use(urlencoded({ limit: maxPayloadBytes, extended: true }));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      // Media is served from the API origin and embedded by the web app on
      // another origin (e.g. :3000 → :3001). same-origin CORP blocks <img>.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Register idempotency interceptor globally
  const idempotencyService = app.get(IdempotencyService);
  app.useGlobalInterceptors(new IdempotencyInterceptor(idempotencyService));

  const swagger = new DocumentBuilder()
    .setTitle('CAPROV API')
    .setDescription(
      'Private-asset intelligence platform — Asset DNA, documents, portfolios and audit.',
    )
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();

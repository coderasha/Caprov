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

loadEnv({
  path: resolve(__dirname, '../.env'),
  override: true,
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true,
  });
  const maxPayloadBytes = '250mb';
  app.useBodyParser('json', { limit: maxPayloadBytes });
  app.useBodyParser('urlencoded', { limit: maxPayloadBytes, extended: true });
  app.use(json({ limit: maxPayloadBytes }));
  app.use(urlencoded({ limit: maxPayloadBytes, extended: true }));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:3000'],
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

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { auth } from './lib/auth';

async function bootstrap() {
  const adapter = new FastifyAdapter({ logger: true });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api';
  const port = configService.get<number>('app.port') || 3001;
  const corsOrigin = configService.get<string>('cors.origin') || '*';

  await app.register(fastifyMultipart as any, {
    limits: {
      fileSize: 48 * 1024 * 1024, // 48 MB
      files: 1,
    },
  });

  await app.register(fastifyCors as any, {
    origin:
      corsOrigin === '*'
        ? true
        : corsOrigin.split(',').map((item) => item.trim()),
    credentials: true,
  });

  // Register Better Auth routes manually for Fastify
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request: any, reply: any) {
      const url = new URL(
        request.url,
        `http://${request.headers.host}`,
      );

      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, String(value));
      });

      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      const response = await auth.handler(req);

      reply.status(response.status);
      response.headers.forEach((value: string, key: string) =>
        reply.header(key, value),
      );

      const body = await response.text();
      reply.send(body || null);
    },
  });

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen({ port, host: '0.0.0.0' });
}

bootstrap();

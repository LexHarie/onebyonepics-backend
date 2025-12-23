// Disable TLS certificate validation for self-signed certs (required for DigitalOcean managed databases)
// Must be set BEFORE any imports that might load pg/tls modules
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
import { BETTER_AUTH_INSTANCE_TOKEN } from '@buiducnhat/nest-better-auth';
import type { Auth } from 'better-auth';

async function bootstrap() {
  const adapter = new FastifyAdapter({ logger: true, trustProxy: true });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
  );
  app.enableShutdownHooks();

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Register Better Auth routes manually for Fastify
  const fastifyInstance = app.getHttpAdapter().getInstance();
  const auth = app.get<Auth>(BETTER_AUTH_INSTANCE_TOKEN);
  fastifyInstance.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request: any, reply: any) {
      try {
        const forwardedProto = request.headers['x-forwarded-proto'];
        const forwardedHost = request.headers['x-forwarded-host'];
        const protocol = Array.isArray(forwardedProto)
          ? forwardedProto[0]
          : forwardedProto?.split(',')[0] || request.protocol || 'http';
        const host = Array.isArray(forwardedHost)
          ? forwardedHost[0]
          : forwardedHost?.split(',')[0] || request.headers.host || 'localhost';
        const url = new URL(request.url, `${protocol}://${host}`);

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
      } catch (error) {
        console.error('Better Auth error:', {
          error,
          url: request.url,
          method: request.method,
          body: request.body,
        });
        reply.status(500).send({
          error: 'Authentication error',
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: process.env.NODE_ENV !== 'production' ? (error instanceof Error ? error.stack : undefined) : undefined,
        });
      }
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

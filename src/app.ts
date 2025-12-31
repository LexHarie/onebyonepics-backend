import { Elysia } from 'elysia';
import cors from '@elysiajs/cors';
import { config } from './config/env';
import { gridConfigsModule } from './modules/grid-configs';
import { imagesModule } from './modules/images';
import { generationModule } from './modules/generation';
import { ordersModule } from './modules/orders';
import { quotasPlugin } from './modules/quotas';
import { rateLimiterPlugin } from './modules/rate-limiter';
import { sessionMigrationModule } from './modules/session-migration';
import { webhooksModule } from './modules/webhooks';
import { cleanupPlugin } from './modules/cleanup';
import { storagePlugin } from './modules/storage';
import { adminModule } from './modules/admin';
import { authPlugin } from './plugins/auth.plugin';
import { databasePlugin } from './plugins/database.plugin';
import { errorHandlerPlugin } from './plugins/error-handler.plugin';
import { httpLoggerPlugin } from './plugins/http-logger.plugin';
import { redisPlugin } from './plugins/redis.plugin';

const corsOrigin =
  config.cors.origin === '*'
    ? true
    : config.cors.origin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

const apiBase = `/${config.app.apiPrefix}`;

export const app = new Elysia({ name: 'onebyonepics-backend' })
  .use(errorHandlerPlugin)
  .use(httpLoggerPlugin)
  .use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  )
  .use(databasePlugin)
  .use(redisPlugin)
  .use(storagePlugin)
  .use(rateLimiterPlugin)
  .use(authPlugin)
  .use(cleanupPlugin)
  .group(apiBase, (api) =>
    api
      .use(gridConfigsModule)
      .use(quotasPlugin)
      .use(imagesModule)
      .use(generationModule)
      .use(ordersModule)
      .use(webhooksModule)
      .use(sessionMigrationModule)
      .use(adminModule),
  )
  .get('/', () => ({ status: 'ok' }));

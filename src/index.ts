// Disable TLS certificate validation for self-signed certs (DigitalOcean managed databases)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { app } from './app';
import { config } from './config/env';
import { AppLogger } from './lib/logger';

app.listen({ port: config.app.port, hostname: '0.0.0.0' });

const logger = new AppLogger('Bootstrap');
logger.log(`Elysia server listening on ${config.app.port}`);

export type App = typeof app;

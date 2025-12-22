import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

// Force disable TLS verification globally for Bun compatibility
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

@Injectable()
export class PgPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(PgPoolService.name);
  private readonly pool: Pool;

  constructor(private readonly configService: ConfigService) {
    const databaseUrl = this.configService.get<string>('database.url');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    // Enable SSL with rejectUnauthorized: false for remote databases with self-signed certs
    const isRemoteDb =
      !databaseUrl.includes('localhost') && !databaseUrl.includes('127.0.0.1');

    this.logger.log(`Database connection: remote=${isRemoteDb}, NODE_TLS_REJECT_UNAUTHORIZED=${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`);

    // For remote databases with self-signed certs, use minimal SSL config
    // that accepts any certificate
    const sslConfig = isRemoteDb
      ? {
          rejectUnauthorized: false,
          checkServerIdentity: () => undefined,
        }
      : false;

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: sslConfig,
      // Limit connections for managed databases with low limits
      max: 4, // Maximum pool size
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 10000, // Fail if can't connect in 10s
    });
  }

  get client(): Pool {
    return this.pool;
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Auth database pool closed');
  }
}

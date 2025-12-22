import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

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
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
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

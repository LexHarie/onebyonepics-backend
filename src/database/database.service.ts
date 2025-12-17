import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQL } from 'bun';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private _sql: SQL | null = null;

  constructor(private readonly configService: ConfigService) {}

  get sql(): SQL {
    if (!this._sql) {
      throw new Error('Database not initialized');
    }
    return this._sql;
  }

  async onModuleInit() {
    const databaseUrl = this.configService.get<string>('database.url');

    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not configured');
    }

    this._sql = new SQL({
      url: databaseUrl,
      max: 20,
      idleTimeout: 30,
      connectionTimeout: 30,
    });

    // Test connection
    try {
      await this._sql`SELECT 1`;
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this._sql) {
      await this._sql.close();
      this.logger.log('Database connection closed');
    }
  }
}

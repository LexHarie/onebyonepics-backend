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

    // Initialize tables
    await this.initializeTables();
  }

  async onModuleDestroy() {
    if (this._sql) {
      await this._sql.close();
      this.logger.log('Database connection closed');
    }
  }

  private async initializeTables() {
    // Create tables if they don't exist
    await this._sql!`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        is_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this._sql!`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMPTZ
      )
    `;

    await this._sql!`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)
    `;

    await this._sql!`
      CREATE TABLE IF NOT EXISTS uploaded_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR(255),
        storage_key VARCHAR(500) NOT NULL,
        storage_url VARCHAR(1000) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL,
        original_filename VARCHAR(255),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this._sql!`
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR(255),
        uploaded_image_id UUID REFERENCES uploaded_images(id) ON DELETE SET NULL,
        grid_config_id VARCHAR(255) NOT NULL,
        variation_count INTEGER DEFAULT 1,
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this._sql!`
      CREATE TABLE IF NOT EXISTS generated_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        generation_job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
        variation_index INTEGER NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        storage_url VARCHAR(1000) NOT NULL,
        mime_type VARCHAR(100) DEFAULT 'image/png',
        file_size INTEGER,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.logger.log('Database tables initialized');
  }
}

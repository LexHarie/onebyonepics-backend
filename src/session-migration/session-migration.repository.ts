import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export const SESSION_MIGRATION_REPOSITORY = Symbol('SESSION_MIGRATION_REPOSITORY');

export interface SessionMigrationRepositoryInterface {
  migrateGenerationJobs(sessionId: string, userId: string): Promise<number>;
  migrateUploadedImages(sessionId: string, userId: string): Promise<number>;
  clearSessionQuota(sessionId: string): Promise<void>;
}

@Injectable()
export class SessionMigrationRepository implements SessionMigrationRepositoryInterface {
  constructor(private readonly db: DatabaseService) {}

  async migrateGenerationJobs(sessionId: string, userId: string): Promise<number> {
    const jobResult = await this.db.sql`
      UPDATE generation_jobs
      SET user_id = ${userId}
      WHERE session_id = ${sessionId}
        AND user_id IS NULL
      RETURNING id
    `;
    return jobResult.length;
  }

  async migrateUploadedImages(sessionId: string, userId: string): Promise<number> {
    const imageResult = await this.db.sql`
      UPDATE uploaded_images
      SET user_id = ${userId}
      WHERE session_id = ${sessionId}
        AND user_id IS NULL
      RETURNING id
    `;
    return imageResult.length;
  }

  async clearSessionQuota(sessionId: string): Promise<void> {
    await this.db.sql`
      DELETE FROM session_quotas
      WHERE session_id = ${sessionId}
    `;
  }
}

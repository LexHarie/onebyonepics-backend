import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/infrastructure/database.service';
import { ISessionMigrationRepository } from '../domain/session-migration.repository.interface';

@Injectable()
export class SessionMigrationRepository implements ISessionMigrationRepository {
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

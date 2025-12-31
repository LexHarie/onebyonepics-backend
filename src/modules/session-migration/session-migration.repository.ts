import type { SQL } from 'bun';
import { getSql } from '../../lib/database';
import type { ISessionMigrationRepository } from './domain/session-migration.repository.interface';

export class SessionMigrationRepository implements ISessionMigrationRepository {
  constructor(private readonly sql: SQL) {}

  async migrateGenerationJobs(sessionId: string, userId: string): Promise<number> {
    const jobResult = await this.sql`
      UPDATE generation_jobs
      SET user_id = ${userId}
      WHERE session_id = ${sessionId}
        AND user_id IS NULL
      RETURNING id
    `;
    return jobResult.length;
  }

  async migrateUploadedImages(sessionId: string, userId: string): Promise<number> {
    const imageResult = await this.sql`
      UPDATE uploaded_images
      SET user_id = ${userId}
      WHERE session_id = ${sessionId}
        AND user_id IS NULL
      RETURNING id
    `;
    return imageResult.length;
  }

  async clearSessionQuota(sessionId: string): Promise<void> {
    await this.sql`
      DELETE FROM session_quotas
      WHERE session_id = ${sessionId}
    `;
  }
}

export const createSessionMigrationRepository = () =>
  new SessionMigrationRepository(getSql());

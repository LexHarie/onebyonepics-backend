import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SessionMigrationService {
  private readonly logger = new Logger(SessionMigrationService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Migrate all data from an anonymous session to an authenticated user
   */
  async migrateSession(sessionId: string, userId: string): Promise<{
    migratedJobs: number;
    migratedImages: number;
  }> {
    this.logger.log(`Migrating session ${sessionId} to user ${userId}`);

    // Migrate generation jobs
    const jobResult = await this.db.sql`
      UPDATE generation_jobs
      SET user_id = ${userId}
      WHERE session_id = ${sessionId}
        AND user_id IS NULL
      RETURNING id
    `;
    const migratedJobs = jobResult.length;

    // Migrate uploaded images
    const imageResult = await this.db.sql`
      UPDATE uploaded_images
      SET user_id = ${userId}
      WHERE session_id = ${sessionId}
        AND user_id IS NULL
      RETURNING id
    `;
    const migratedImages = imageResult.length;

    // Clear session quota (user gets their own quota now)
    await this.db.sql`
      DELETE FROM session_quotas
      WHERE session_id = ${sessionId}
    `;

    this.logger.log(
      `Migration complete: ${migratedJobs} jobs, ${migratedImages} images migrated`,
    );

    return {
      migratedJobs,
      migratedImages,
    };
  }
}

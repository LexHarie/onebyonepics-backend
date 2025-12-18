import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ISessionMigrationRepositoryToken,
  type ISessionMigrationRepository,
} from '../domain/session-migration.repository.interface';

@Injectable()
export class SessionMigrationService {
  private readonly logger = new Logger(SessionMigrationService.name);

  constructor(
    @Inject(ISessionMigrationRepositoryToken)
    private readonly sessionMigrationRepository: ISessionMigrationRepository,
  ) {}

  /**
   * Migrate all data from an anonymous session to an authenticated user
   */
  async migrateSession(sessionId: string, userId: string): Promise<{
    migratedJobs: number;
    migratedImages: number;
  }> {
    this.logger.log(`Migrating session ${sessionId} to user ${userId}`);

    // Migrate generation jobs
    const migratedJobs = await this.sessionMigrationRepository.migrateGenerationJobs(
      sessionId,
      userId,
    );

    // Migrate uploaded images
    const migratedImages = await this.sessionMigrationRepository.migrateUploadedImages(
      sessionId,
      userId,
    );

    // Clear session quota (user gets their own quota now)
    await this.sessionMigrationRepository.clearSessionQuota(sessionId);

    this.logger.log(
      `Migration complete: ${migratedJobs} jobs, ${migratedImages} images migrated`,
    );

    return {
      migratedJobs,
      migratedImages,
    };
  }
}

import type { ISessionMigrationRepository } from './domain/session-migration.repository.interface';

export class SessionMigrationService {
  constructor(private readonly sessionMigrationRepository: ISessionMigrationRepository) {}

  async migrateSession(
    sessionId: string,
    userId: string,
  ): Promise<{ migratedJobs: number; migratedImages: number }> {
    const migratedJobs = await this.sessionMigrationRepository.migrateGenerationJobs(
      sessionId,
      userId,
    );

    const migratedImages = await this.sessionMigrationRepository.migrateUploadedImages(
      sessionId,
      userId,
    );

    await this.sessionMigrationRepository.clearSessionQuota(sessionId);

    return {
      migratedJobs,
      migratedImages,
    };
  }
}

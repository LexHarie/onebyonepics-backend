export interface ISessionMigrationRepository {
  migrateGenerationJobs(sessionId: string, userId: string): Promise<number>;
  migrateUploadedImages(sessionId: string, userId: string): Promise<number>;
  clearSessionQuota(sessionId: string): Promise<void>;
}

export const ISessionMigrationRepositoryToken = Symbol('ISessionMigrationRepository');

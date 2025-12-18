import { SessionMigrationRepository } from './database/repositories/session-migration.repository';
import { ISessionMigrationRepositoryToken } from '../domain/session-migration.repository.interface';

export const SessionMigrationRepositoryInterfaces = [
  {
    provide: ISessionMigrationRepositoryToken,
    useClass: SessionMigrationRepository,
  },
];

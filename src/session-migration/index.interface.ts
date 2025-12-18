import { SessionMigrationRepository } from './session-migration.repository';
import { ISessionMigrationRepositoryToken } from './session-migration.repository.interface';

export const SessionMigrationRepositoryInterfaces = [
  {
    provide: ISessionMigrationRepositoryToken,
    useClass: SessionMigrationRepository,
  },
];

import { CleanupRepository } from './database/repositories/cleanup.repository';
import { ICleanupRepositoryToken } from '../domain/cleanup.repository.interface';

export const CleanupRepositoryInterfaces = [
  {
    provide: ICleanupRepositoryToken,
    useClass: CleanupRepository,
  },
];

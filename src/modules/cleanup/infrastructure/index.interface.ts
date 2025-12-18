import { CleanupRepository } from './cleanup.repository';
import { ICleanupRepositoryToken } from './cleanup.repository.interface';

export const CleanupRepositoryInterfaces = [
  {
    provide: ICleanupRepositoryToken,
    useClass: CleanupRepository,
  },
];

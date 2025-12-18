import { GenerationRepository } from './database/repositories/generation.repository';
import { IGenerationRepositoryToken } from '../domain/generation.repository.interface';

export const GenerationRepositoryInterfaces = [
  {
    provide: IGenerationRepositoryToken,
    useClass: GenerationRepository,
  },
];

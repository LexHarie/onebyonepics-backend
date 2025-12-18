import { GenerationRepository } from './generation.repository';
import { IGenerationRepositoryToken } from '../domain/generation.repository.interface';

export const GenerationRepositoryInterfaces = [
  {
    provide: IGenerationRepositoryToken,
    useClass: GenerationRepository,
  },
];

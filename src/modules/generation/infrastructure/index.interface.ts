import { GenerationRepository } from './generation.repository';
import { IGenerationRepositoryToken } from './generation.repository.interface';

export const GenerationRepositoryInterfaces = [
  {
    provide: IGenerationRepositoryToken,
    useClass: GenerationRepository,
  },
];

import { ImagesRepository } from './database/repositories/images.repository';
import { IImagesRepositoryToken } from '../domain/images.repository.interface';

export const ImagesRepositoryInterfaces = [
  {
    provide: IImagesRepositoryToken,
    useClass: ImagesRepository,
  },
];

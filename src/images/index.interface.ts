import { ImagesRepository } from './images.repository';
import { IImagesRepositoryToken } from './images.repository.interface';

export const ImagesRepositoryInterfaces = [
  {
    provide: IImagesRepositoryToken,
    useClass: ImagesRepository,
  },
];

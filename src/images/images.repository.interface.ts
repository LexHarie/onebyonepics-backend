import { UploadedImageRow } from './entities/image.entity';

export interface IImagesRepository {
  insertUploadedImage(params: {
    userId: string | null;
    sessionId: string | null;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    originalFilename: string | null;
    expiresAt: Date;
  }): Promise<UploadedImageRow>;
  findById(id: string): Promise<UploadedImageRow | null>;
  deleteById(id: string): Promise<void>;
}

export const IImagesRepositoryToken = Symbol('IImagesRepository');

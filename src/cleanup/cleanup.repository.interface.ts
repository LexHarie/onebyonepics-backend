import { UploadedImageRow } from '../images/entities/image.entity';
import { GeneratedImageRow } from '../generation/entities/generated-image.entity';

export interface ICleanupRepository {
  findExpiredUploads(now: Date): Promise<UploadedImageRow[]>;
  deleteUploadById(id: string): Promise<void>;
  findExpiredGenerated(now: Date): Promise<GeneratedImageRow[]>;
  deleteGeneratedById(id: string): Promise<void>;
}

export const ICleanupRepositoryToken = Symbol('ICleanupRepository');

import { UploadedImageRow } from '../../images/domain/entities/image.entity';
import { GeneratedImageRow } from '../../generation/domain/entities/generated-image.entity';

export interface ICleanupRepository {
  findExpiredUploads(now: Date): Promise<UploadedImageRow[]>;
  deleteUploadById(id: string): Promise<void>;
  findExpiredGenerated(now: Date): Promise<GeneratedImageRow[]>;
  deleteGeneratedById(id: string): Promise<void>;
}

export const ICleanupRepositoryToken = Symbol('ICleanupRepository');

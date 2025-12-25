import type {
  GenerationJobRow,
  GenerationJobStatus,
} from './entities/generation-job.entity';
import type { GeneratedImageRow } from './entities/generated-image.entity';
import type { UploadedImageRow } from '../../images/domain/entities/image.entity';

export interface IGenerationRepository {
  createJob(params: {
    userId: string | null;
    sessionId: string | null;
    uploadedImageId: string;
    gridConfigId: string;
    variationCount: number;
  }): Promise<GenerationJobRow>;
  findJobById(jobId: string): Promise<GenerationJobRow | null>;
  findJobsByUserId(userId: string): Promise<GenerationJobRow[]>;
  findJobsBySessionId(sessionId: string): Promise<GenerationJobRow[]>;
  updateJobProcessing(jobId: string, startedAt: Date): Promise<void>;
  updateJobCompleted(jobId: string, completedAt: Date): Promise<void>;
  updateJobFailed(jobId: string, errorMessage: string): Promise<void>;
  findJobsForRecovery(params: {
    statuses: GenerationJobStatus[];
    createdAfter: Date;
  }): Promise<GenerationJobRow[]>;
  findGeneratedImagesByJobId(
    jobId: string,
    isPreview: boolean,
  ): Promise<GeneratedImageRow[]>;
  insertGeneratedImage(params: {
    jobId: string;
    variationIndex: number;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    expiresAt: Date | null;
    isPermanent: boolean;
    isPreview: boolean;
  }): Promise<void>;
  findUploadedImageById(uploadedImageId: string): Promise<UploadedImageRow | null>;
}

export const IGenerationRepositoryToken = Symbol('IGenerationRepository');

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/infrastructure/database.service';
import type {
  GenerationJobRow,
  GenerationJobStatus,
} from '../../../domain/entities/generation-job.entity';
import type { GeneratedImageRow } from '../../../domain/entities/generated-image.entity';
import type { UploadedImageRow } from '../../../../images/domain/entities/image.entity';
import type { IGenerationRepository } from '../../../domain/generation.repository.interface';

@Injectable()
export class GenerationRepository implements IGenerationRepository {
  constructor(private readonly db: DatabaseService) {}

  async createJob(params: {
    userId: string | null;
    sessionId: string | null;
    uploadedImageId: string;
    gridConfigId: string;
    variationCount: number;
  }): Promise<GenerationJobRow> {
    const rows = await this.db.sql<GenerationJobRow[]>`
      INSERT INTO generation_jobs (
        user_id, session_id, uploaded_image_id, grid_config_id,
        variation_count, status
      )
      VALUES (
        ${params.userId}, ${params.sessionId}, ${params.uploadedImageId},
        ${params.gridConfigId}, ${params.variationCount}, 'pending'
      )
      RETURNING *
    `;
    return rows[0];
  }

  async findJobById(jobId: string): Promise<GenerationJobRow | null> {
    const rows = await this.db.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findJobsByUserId(userId: string): Promise<GenerationJobRow[]> {
    return this.db.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
  }

  async findJobsBySessionId(sessionId: string): Promise<GenerationJobRow[]> {
    return this.db.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
    `;
  }

  async updateJobProcessing(jobId: string, startedAt: Date): Promise<void> {
    await this.db.sql`
      UPDATE generation_jobs
      SET status = 'processing', started_at = ${startedAt}
      WHERE id = ${jobId}
    `;
  }

  async updateJobCompleted(jobId: string, completedAt: Date): Promise<void> {
    await this.db.sql`
      UPDATE generation_jobs
      SET status = 'completed', completed_at = ${completedAt}
      WHERE id = ${jobId}
    `;
  }

  async updateJobFailed(jobId: string, errorMessage: string): Promise<void> {
    await this.db.sql`
      UPDATE generation_jobs
      SET status = 'failed', error_message = ${errorMessage}
      WHERE id = ${jobId}
    `;
  }

  async findJobsForRecovery(params: {
    statuses: GenerationJobStatus[];
    createdAfter: Date;
  }): Promise<GenerationJobRow[]> {
    if (params.statuses.length === 0) return [];

    const statusArray = this.db.sql.array(params.statuses, 'text');
    return this.db.sql<GenerationJobRow[]>`
      SELECT *
      FROM generation_jobs
      WHERE status = ANY(${statusArray})
        AND created_at >= ${params.createdAfter}
      ORDER BY created_at ASC
    `;
  }

  async findGeneratedImagesByJobId(
    jobId: string,
    isPreview: boolean,
  ): Promise<GeneratedImageRow[]> {
    return this.db.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images
      WHERE generation_job_id = ${jobId}
        AND is_preview = ${isPreview}
      ORDER BY variation_index ASC
    `;
  }

  async insertGeneratedImage(params: {
    jobId: string;
    variationIndex: number;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    expiresAt: Date | null;
    isPermanent: boolean;
    isPreview: boolean;
  }): Promise<void> {
    await this.db.sql`
      INSERT INTO generated_images (
        generation_job_id, variation_index, storage_key,
        mime_type, file_size, expires_at, is_permanent, is_preview
      )
      VALUES (
        ${params.jobId}, ${params.variationIndex}, ${params.storageKey},
        ${params.mimeType}, ${params.fileSize}, ${params.expiresAt},
        ${params.isPermanent}, ${params.isPreview}
      )
    `;
  }

  async findUploadedImageById(uploadedImageId: string): Promise<UploadedImageRow | null> {
    const rows = await this.db.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE id = ${uploadedImageId} LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

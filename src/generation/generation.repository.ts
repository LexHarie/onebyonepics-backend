import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GenerationJobRow } from './entities/generation-job.entity';
import { GeneratedImageRow } from './entities/generated-image.entity';
import { UploadedImageRow } from '../images/entities/image.entity';

export const GENERATION_REPOSITORY = Symbol('GENERATION_REPOSITORY');

export interface GenerationRepositoryInterface {
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

@Injectable()
export class GenerationRepository implements GenerationRepositoryInterface {
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

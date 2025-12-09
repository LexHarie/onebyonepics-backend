import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { ImagesService } from '../images/images.service';
import { StorageService } from '../storage/storage.service';
import { GenAIService } from '../genai/genai.service';
import { GenerationJob, GenerationJobRow, GenerationJobStatus, rowToGenerationJob } from './entities/generation-job.entity';
import { GeneratedImage, GeneratedImageRow, rowToGeneratedImage } from './entities/generated-image.entity';
import { UploadedImageRow, rowToUploadedImage } from '../images/entities/image.entity';
import type { User } from '../users/entities/user.entity';
import { gridConfigs } from '../grid-configs/data/grid-configs.data';

@Injectable()
export class GenerationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly imagesService: ImagesService,
    private readonly storageService: StorageService,
    private readonly genAIService: GenAIService,
    private readonly configService: ConfigService,
  ) {}

  async createJob(params: {
    user?: User | null;
    sessionId?: string;
    uploadedImageId: string;
    gridConfigId: string;
    variationCount: number;
  }) {
    const { user, sessionId, uploadedImageId, gridConfigId } = params;
    const variationCount = Math.min(Math.max(params.variationCount || 1, 1), 4);

    const configExists = gridConfigs.some((cfg) => cfg.id === gridConfigId);
    if (!configExists) {
      throw new BadRequestException('Invalid grid configuration');
    }

    const image = await this.imagesService.getImageForRequester(
      uploadedImageId,
      user,
      sessionId,
    );

    if (!image) {
      throw new NotFoundException('Uploaded image not found');
    }

    const userId = user?.id ?? null;

    const rows = await this.db.sql<GenerationJobRow[]>`
      INSERT INTO generation_jobs (
        user_id, session_id, uploaded_image_id, grid_config_id,
        variation_count, status
      )
      VALUES (
        ${userId}, ${sessionId ?? null}, ${uploadedImageId}, ${gridConfigId},
        ${variationCount}, 'pending'
      )
      RETURNING *
    `;

    const job = rowToGenerationJob(rows[0]);

    // Fire and forget processing
    this.processJob(job.id).catch((err) => {
      // error is handled inside processJob, swallow to avoid unhandled rejection
      return err;
    });

    return { jobId: job.id, status: job.status };
  }

  async getStatus(jobId: string, user?: User | null, sessionId?: string) {
    const rows = await this.db.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1
    `;

    if (rows.length === 0) throw new NotFoundException('Job not found');

    const job = rowToGenerationJob(rows[0]);

    if (!this.canAccess(job, user, sessionId)) {
      throw new ForbiddenException('Access denied');
    }

    return {
      jobId: job.id,
      status: job.status,
      progress: this.mapProgress(job.status),
      error: job.errorMessage,
    };
  }

  async getResult(
    jobId: string,
    user?: User | null,
    sessionId?: string,
    includeData = false,
  ) {
    const jobRows = await this.db.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1
    `;

    if (jobRows.length === 0) throw new NotFoundException('Job not found');

    const job = rowToGenerationJob(jobRows[0]);

    if (!this.canAccess(job, user, sessionId)) {
      throw new ForbiddenException('Access denied');
    }

    if (job.status !== 'completed') {
      throw new BadRequestException('Job not completed yet');
    }

    const generatedRows = await this.db.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images
      WHERE generation_job_id = ${jobId}
      ORDER BY variation_index ASC
    `;

    const generatedImages = generatedRows.map(rowToGeneratedImage);

    const images = await Promise.all(
      generatedImages.map(async (img) => {
        const base = {
          key: img.storageKey,
          url: img.storageUrl,
          mimeType: img.mimeType,
        } as any;
        if (includeData) {
          const buffer = await this.storageService.getObjectBuffer(img.storageKey);
          base.data = buffer.toString('base64');
        }
        return base;
      }),
    );

    return { jobId: job.id, images };
  }

  async getHistory(user?: User | null, sessionId?: string) {
    if (!user && !sessionId) {
      throw new BadRequestException('User or session required');
    }

    let rows: GenerationJobRow[];

    if (user) {
      rows = await this.db.sql<GenerationJobRow[]>`
        SELECT * FROM generation_jobs
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
      `;
    } else {
      rows = await this.db.sql<GenerationJobRow[]>`
        SELECT * FROM generation_jobs
        WHERE session_id = ${sessionId}
        ORDER BY created_at DESC
      `;
    }

    return rows.map((row) => {
      const job = rowToGenerationJob(row);
      return {
        id: job.id,
        gridConfigId: job.gridConfigId,
        variationCount: job.variationCount,
        status: job.status,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      };
    });
  }

  private mapProgress(status: GenerationJobStatus) {
    switch (status) {
      case 'pending':
        return 10;
      case 'processing':
        return 60;
      case 'completed':
        return 100;
      case 'failed':
        return 100;
      default:
        return 0;
    }
  }

  private canAccess(job: GenerationJob, user?: User | null, sessionId?: string) {
    if (user && job.userId === user.id) return true;
    if (!job.userId && sessionId && job.sessionId === sessionId) return true;
    if (sessionId && job.sessionId && job.sessionId === sessionId) return true;
    return false;
  }

  private async processJob(jobId: string) {
    const jobRows = await this.db.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1
    `;

    if (jobRows.length === 0) return;

    const job = rowToGenerationJob(jobRows[0]);

    if (!job.uploadedImageId) {
      await this.db.sql`
        UPDATE generation_jobs
        SET status = 'failed', error_message = 'Uploaded image missing'
        WHERE id = ${jobId}
      `;
      return;
    }

    // Get uploaded image
    const imageRows = await this.db.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE id = ${job.uploadedImageId} LIMIT 1
    `;

    if (imageRows.length === 0) {
      await this.db.sql`
        UPDATE generation_jobs
        SET status = 'failed', error_message = 'Uploaded image not found'
        WHERE id = ${jobId}
      `;
      return;
    }

    const uploadedImage = rowToUploadedImage(imageRows[0]);

    // Update status to processing
    await this.db.sql`
      UPDATE generation_jobs
      SET status = 'processing', started_at = ${new Date()}
      WHERE id = ${jobId}
    `;

    try {
      const imageBuffer = await this.storageService.getObjectBuffer(
        uploadedImage.storageKey,
      );

      const generated = await this.genAIService.generateImages(
        imageBuffer,
        job.variationCount,
      );

      const expiresDays =
        this.configService.get<number>('cleanup.generatedImagesDays') || 7;
      const expiresAt = new Date(
        Date.now() + expiresDays * 24 * 60 * 60 * 1000,
      );

      for (let i = 0; i < generated.length; i++) {
        const gen = generated[i];
        const mimeType = gen.mimeType || 'image/png';
        const buffer = Buffer.from(gen.data, 'base64');
        const key = `generated/${job.id}/variation-${i + 1}.png`;
        const url = await this.storageService.uploadObject(key, buffer, mimeType);

        await this.db.sql`
          INSERT INTO generated_images (
            generation_job_id, variation_index, storage_key, storage_url,
            mime_type, file_size, expires_at
          )
          VALUES (
            ${jobId}, ${i + 1}, ${key}, ${url},
            ${mimeType}, ${buffer.length}, ${expiresAt}
          )
        `;
      }

      await this.db.sql`
        UPDATE generation_jobs
        SET status = 'completed', completed_at = ${new Date()}
        WHERE id = ${jobId}
      `;
    } catch (err) {
      await this.db.sql`
        UPDATE generation_jobs
        SET status = 'failed', error_message = ${(err as Error).message}
        WHERE id = ${jobId}
      `;
    }
  }
}

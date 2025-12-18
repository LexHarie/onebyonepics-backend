import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { User } from '@buiducnhat/nest-better-auth';
import { DatabaseService } from '../database/database.service';
import { ImagesService } from '../images/images.service';
import { StorageService } from '../storage/storage.service';
import { GenAIService } from '../genai/genai.service';
import { QuotasService } from '../quotas/quotas.service';
import { WatermarkService } from '../watermark/watermark.service';
import { GenerationJob, GenerationJobRow, GenerationJobStatus, rowToGenerationJob } from './entities/generation-job.entity';
import { GeneratedImage, GeneratedImageRow, rowToGeneratedImage } from './entities/generated-image.entity';
import { UploadedImageRow, rowToUploadedImage } from '../images/entities/image.entity';
import { gridConfigs } from '../grid-configs/data/grid-configs.data';
import { GENERATION_QUEUE } from '../queue/queue.module';
import type { GenerationJobData } from './generation.processor';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly imagesService: ImagesService,
    private readonly storageService: StorageService,
    private readonly genAIService: GenAIService,
    private readonly configService: ConfigService,
    private readonly quotasService: QuotasService,
    private readonly watermarkService: WatermarkService,
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue<GenerationJobData>,
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

    // Check quota for anonymous users
    if (!user && sessionId) {
      const canGenerate = await this.quotasService.canGenerate(sessionId, variationCount);
      if (!canGenerate) {
        this.logger.warn(`Session ${sessionId} exceeded preview quota`);
        throw new ForbiddenException({
          code: 'QUOTA_EXCEEDED',
          message: 'Free preview limit reached. Please sign up or purchase to continue.',
        });
      }
    }

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

    // Add job to queue for processing
    await this.generationQueue.add(
      'generate',
      { jobId: job.id },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    this.logger.log(`Generation job ${job.id} added to queue`);

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

    // Only return preview (watermarked) images to the frontend
    const generatedRows = await this.db.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images
      WHERE generation_job_id = ${jobId}
        AND is_preview = true
      ORDER BY variation_index ASC
    `;

    const generatedImages = generatedRows.map(rowToGeneratedImage);

    const images = await Promise.all(
      generatedImages.map(async (img) => {
        // Generate a signed URL with 5-minute expiration
        const signedUrl = await this.storageService.getSignedUrl(img.storageKey, 300);
        const base: {
          key: string;
          url: string;
          mimeType: string;
          isPreview: boolean;
          data?: string;
        } = {
          key: img.storageKey,
          url: signedUrl,
          mimeType: img.mimeType,
          isPreview: img.isPreview,
        };
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

      const generationResult = await this.genAIService.generateImages(
        imageBuffer,
        job.variationCount,
      );

      const { images } = generationResult;

      const expiresDays =
        this.configService.get<number>('cleanup.generatedImagesDays') || 7;
      const expiresAt = new Date(
        Date.now() + expiresDays * 24 * 60 * 60 * 1000,
      );

      for (let i = 0; i < images.length; i++) {
        const gen = images[i];
        const mimeType = gen.mimeType || 'image/png';
        let buffer: Buffer = Buffer.from(gen.data, 'base64');

        // Apply watermark to preview images
        buffer = await this.watermarkService.applyPreviewWatermark(buffer);

        const key = `generated/${job.id}/variation-${i + 1}.png`;
        await this.storageService.uploadObject(key, buffer, mimeType);

        await this.db.sql`
          INSERT INTO generated_images (
            generation_job_id, variation_index, storage_key,
            mime_type, file_size, expires_at, is_permanent, is_preview
          )
          VALUES (
            ${jobId}, ${i + 1}, ${key},
            ${mimeType}, ${buffer.length}, ${expiresAt}, false, true
          )
        `;
      }

      // Increment quota for anonymous users after successful generation
      if (job.sessionId && !job.userId) {
        await this.quotasService.incrementUsage(job.sessionId, job.variationCount);
        this.logger.debug(`Incremented quota for session ${job.sessionId}`);
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

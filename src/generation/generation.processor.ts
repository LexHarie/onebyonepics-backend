import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { GenAIService } from '../genai/genai.service';
import { QuotasService } from '../quotas/quotas.service';
import { WatermarkService } from '../watermark/watermark.service';
import { GenerationJobRow, rowToGenerationJob } from './entities/generation-job.entity';
import { UploadedImageRow, rowToUploadedImage } from '../images/entities/image.entity';
import { GENERATION_QUEUE } from '../queue/queue.module';
import { RateLimitExceededException } from '../rate-limiter/rate-limiter.service';

export interface GenerationJobData {
  jobId: string;
}

// Concurrency is set to 5 to stay under the 20 RPM limit for primary model
// With avg 2 API calls per job, 5 concurrent jobs = ~10 RPM (safe margin)
@Processor(GENERATION_QUEUE, {
  concurrency: 5,
})
export class GenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerationProcessor.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
    private readonly genAIService: GenAIService,
    private readonly configService: ConfigService,
    private readonly quotasService: QuotasService,
    private readonly watermarkService: WatermarkService,
  ) {
    super();
  }

  async process(job: Job<GenerationJobData>): Promise<void> {
    const { jobId } = job.data;
    this.logger.log(`Processing generation job ${jobId} (Bull job ${job.id})`);

    const jobRows = await this.db.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1
    `;

    if (jobRows.length === 0) {
      this.logger.warn(`Generation job ${jobId} not found`);
      return;
    }

    const genJob = rowToGenerationJob(jobRows[0]);

    if (!genJob.uploadedImageId) {
      await this.db.sql`
        UPDATE generation_jobs
        SET status = 'failed', error_message = 'Uploaded image missing'
        WHERE id = ${jobId}
      `;
      return;
    }

    // Get uploaded image
    const imageRows = await this.db.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE id = ${genJob.uploadedImageId} LIMIT 1
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
        genJob.variationCount,
      );

      const { images, modelUsed, isFallback, totalTokens } = generationResult;

      this.logger.log(
        `Generation ${jobId}: model=${modelUsed}, fallback=${isFallback}, tokens=${totalTokens}`,
      );

      const expiresDays =
        this.configService.get<number>('cleanup.generatedImagesDays') || 7;
      const expiresAt = new Date(
        Date.now() + expiresDays * 24 * 60 * 60 * 1000,
      );

      for (let i = 0; i < images.length; i++) {
        const gen = images[i];
        const mimeType = gen.mimeType || 'image/png';
        const originalBuffer = Buffer.from(gen.data, 'base64');

        // Store unwatermarked version (for paid orders)
        const unwatermarkedKey = `generated/${genJob.id}/variation-${i + 1}-full.png`;
        await this.storageService.uploadObject(unwatermarkedKey, originalBuffer, mimeType);

        await this.db.sql`
          INSERT INTO generated_images (
            generation_job_id, variation_index, storage_key,
            mime_type, file_size, expires_at, is_permanent, is_preview
          )
          VALUES (
            ${jobId}, ${i + 1}, ${unwatermarkedKey},
            ${mimeType}, ${originalBuffer.length}, ${expiresAt}, false, false
          )
        `;

        // Apply watermark for preview version
        const watermarkedBuffer = await this.watermarkService.applyPreviewWatermark(originalBuffer);

        const previewKey = `generated/${genJob.id}/variation-${i + 1}-preview.png`;
        await this.storageService.uploadObject(previewKey, watermarkedBuffer, mimeType);

        await this.db.sql`
          INSERT INTO generated_images (
            generation_job_id, variation_index, storage_key,
            mime_type, file_size, expires_at, is_permanent, is_preview
          )
          VALUES (
            ${jobId}, ${i + 1}, ${previewKey},
            ${mimeType}, ${watermarkedBuffer.length}, ${expiresAt}, false, true
          )
        `;

        // Report progress
        await job.updateProgress(Math.round(((i + 1) / images.length) * 90));
      }

      // Increment quota for anonymous users after successful generation
      if (genJob.sessionId && !genJob.userId) {
        await this.quotasService.incrementUsage(genJob.sessionId, genJob.variationCount);
        this.logger.debug(`Incremented quota for session ${genJob.sessionId}`);
      }

      await this.db.sql`
        UPDATE generation_jobs
        SET status = 'completed', completed_at = ${new Date()}
        WHERE id = ${jobId}
      `;

      this.logger.log(`Generation job ${jobId} completed successfully`);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Generation job ${jobId} failed: ${error.message}`);

      // Handle rate limit errors specifically
      const isRateLimitError = err instanceof RateLimitExceededException;
      const errorMessage = isRateLimitError
        ? `Rate limit exceeded: ${error.message}`
        : error.message;

      await this.db.sql`
        UPDATE generation_jobs
        SET status = 'failed', error_message = ${errorMessage}
        WHERE id = ${jobId}
      `;

      // Re-throw to trigger BullMQ retry (exponential backoff will help with rate limits)
      throw err;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<GenerationJobData>) {
    this.logger.debug(`Job ${job.id} completed for generation ${job.data.jobId}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<GenerationJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed for generation ${job.data.jobId}: ${error.message}`,
    );
  }
}

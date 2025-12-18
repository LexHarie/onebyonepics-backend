import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../storage/infrastructure/storage.service';
import { GenAIService } from '../../genai/infrastructure/genai.service';
import { QuotasService } from '../../quotas/application/quotas.service';
import { WatermarkService } from '../../watermark/application/watermark.service';
import { rowToGenerationJob } from '../domain/entities/generation-job.entity';
import { rowToUploadedImage } from '../../images/domain/entities/image.entity';
import { GENERATION_QUEUE } from '../../queue/infrastructure/queue.module';
import { RateLimitExceededException } from '../../rate-limiter/application/rate-limiter.service';
import {
  IGenerationRepository,
  IGenerationRepositoryToken,
} from '../domain/generation.repository.interface';

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
    @Inject(IGenerationRepositoryToken)
    private readonly generationRepository: IGenerationRepository,
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

    const jobRow = await this.generationRepository.findJobById(jobId);
    if (!jobRow) {
      this.logger.warn(`Generation job ${jobId} not found`);
      return;
    }

    const genJob = rowToGenerationJob(jobRow);

    if (!genJob.uploadedImageId) {
      await this.generationRepository.updateJobFailed(
        jobId,
        'Uploaded image missing',
      );
      return;
    }

    // Get uploaded image
    const imageRow = await this.generationRepository.findUploadedImageById(
      genJob.uploadedImageId,
    );

    if (!imageRow) {
      await this.generationRepository.updateJobFailed(
        jobId,
        'Uploaded image not found',
      );
      return;
    }

    const uploadedImage = rowToUploadedImage(imageRow);

    // Update status to processing
    await this.generationRepository.updateJobProcessing(jobId, new Date());

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

        await this.generationRepository.insertGeneratedImage({
          jobId,
          variationIndex: i + 1,
          storageKey: unwatermarkedKey,
          mimeType,
          fileSize: originalBuffer.length,
          expiresAt,
          isPermanent: false,
          isPreview: false,
        });

        // Apply watermark for preview version
        const watermarkedBuffer = await this.watermarkService.applyPreviewWatermark(originalBuffer);

        const previewKey = `generated/${genJob.id}/variation-${i + 1}-preview.png`;
        await this.storageService.uploadObject(previewKey, watermarkedBuffer, mimeType);

        await this.generationRepository.insertGeneratedImage({
          jobId,
          variationIndex: i + 1,
          storageKey: previewKey,
          mimeType,
          fileSize: watermarkedBuffer.length,
          expiresAt,
          isPermanent: false,
          isPreview: true,
        });

        // Report progress
        await job.updateProgress(Math.round(((i + 1) / images.length) * 90));
      }

      // Increment quota for anonymous users after successful generation
      if (genJob.sessionId && !genJob.userId) {
        await this.quotasService.incrementUsage(genJob.sessionId, genJob.variationCount);
        this.logger.debug(`Incremented quota for session ${genJob.sessionId}`);
      }

      await this.generationRepository.updateJobCompleted(jobId, new Date());

      this.logger.log(`Generation job ${jobId} completed successfully`);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Generation job ${jobId} failed: ${error.message}`);

      // Handle rate limit errors specifically
      const isRateLimitError = err instanceof RateLimitExceededException;
      const errorMessage = isRateLimitError
        ? `Rate limit exceeded: ${error.message}`
        : error.message;

      await this.generationRepository.updateJobFailed(jobId, errorMessage);

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

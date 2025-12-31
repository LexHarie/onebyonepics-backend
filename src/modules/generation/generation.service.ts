import type { AuthUser } from '../../guards/auth.guard';
import { config } from '../../config/env';
import { httpError } from '../../lib/http-error';
import { gridConfigs } from '../grid-configs/domain/data/grid-configs.data';
import { rowToGeneratedImage } from './domain/entities/generated-image.entity';
import {
  rowToGenerationJob,
  type GenerationJob,
  type GenerationJobStatus,
} from './domain/entities/generation-job.entity';
import { rowToUploadedImage } from '../images/domain/entities/image.entity';
import { ImagesService } from '../images/images.service';
import { StorageService } from '../storage/storage.service';
import { GenAIService } from '../genai/genai.service';
import { QuotasService } from '../quotas/quotas.service';
import { WatermarkService } from '../watermark/watermark.service';
import {
  RateLimitExceededException,
} from '../rate-limiter/rate-limiter.service';
import type { IGenerationRepository } from './domain/generation.repository.interface';
import type { OrdersService } from '../orders/orders.service';
import { AppLogger } from '../../lib/logger';

export class GenerationService {
  private readonly logger = new AppLogger('GenerationService');
  private ordersService?: OrdersService;

  constructor(
    private readonly generationRepository: IGenerationRepository,
    private readonly imagesService: ImagesService,
    private readonly storageService: StorageService,
    private readonly genAIService: GenAIService,
    private readonly quotasService: QuotasService,
    private readonly watermarkService: WatermarkService,
  ) {}

  setOrdersService(service: OrdersService) {
    this.ordersService = service;
  }

  async runJob(jobId: string) {
    await this.processJob(jobId);
  }

  async createJob(params: {
    user?: AuthUser | null;
    sessionId?: string;
    uploadedImageId: string;
    gridConfigId: string;
    variationCount: number;
  }) {
    const { user, sessionId, uploadedImageId, gridConfigId } = params;
    const variationCount = Math.min(Math.max(params.variationCount || 1, 1), 4);

    if (!user && sessionId) {
      const canGenerate = await this.quotasService.canGenerate(
        sessionId,
        variationCount,
      );
      if (!canGenerate) {
        throw httpError(
          403,
          'Free preview limit reached. Please sign up or purchase to continue.',
          { code: 'QUOTA_EXCEEDED' },
        );
      }
    }

    const configExists = gridConfigs.some((cfg) => cfg.id === gridConfigId);
    if (!configExists) {
      throw httpError(400, 'Invalid grid configuration');
    }

    const image = await this.imagesService.getImageForRequester(
      uploadedImageId,
      user,
      sessionId,
    );

    if (!image) {
      throw httpError(404, 'Uploaded image not found');
    }

    const userId = user?.id ?? null;

    const row = await this.generationRepository.createJob({
      userId,
      sessionId: sessionId ?? null,
      uploadedImageId,
      gridConfigId,
      variationCount,
    });

    const job = rowToGenerationJob(row);

    void this.processJob(job.id).catch((error) => {
      this.logger.error(`Generation job ${job.id} failed`, error);
    });

    return { jobId: job.id, status: job.status };
  }

  async getStatus(jobId: string, user?: AuthUser | null, sessionId?: string) {
    const row = await this.generationRepository.findJobById(jobId);
    if (!row) throw httpError(404, 'Job not found');

    const job = rowToGenerationJob(row);

    if (!this.canAccess(job, user, sessionId)) {
      throw httpError(403, 'Access denied');
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
    user?: AuthUser | null,
    sessionId?: string,
    includeData = false,
  ) {
    const jobRow = await this.generationRepository.findJobById(jobId);
    if (!jobRow) throw httpError(404, 'Job not found');

    const job = rowToGenerationJob(jobRow);

    if (!this.canAccess(job, user, sessionId)) {
      throw httpError(403, 'Access denied');
    }

    if (job.status !== 'completed') {
      throw httpError(400, 'Job not completed yet');
    }

    const generatedRows = await this.generationRepository.findGeneratedImagesByJobId(
      jobId,
      true,
    );

    const generatedImages = generatedRows.map(rowToGeneratedImage);

    const images = await Promise.all(
      generatedImages.map(async (img) => {
        const signedUrl = await this.storageService.getSignedUrl(
          img.storageKey,
          300,
        );
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
          const buffer = await this.storageService.getObjectBuffer(
            img.storageKey,
          );
          base.data = buffer.toString('base64');
        }
        return base;
      }),
    );

    return { jobId: job.id, images };
  }

  async assertJobReadyForOrder(
    jobId: string,
    user?: AuthUser | null,
    sessionId?: string,
  ): Promise<void> {
    const jobRow = await this.generationRepository.findJobById(jobId);
    if (!jobRow) throw httpError(404, 'Job not found');

    const job = rowToGenerationJob(jobRow);

    if (!this.canAccess(job, user, sessionId)) {
      throw httpError(403, 'Access denied');
    }

    if (job.status !== 'completed') {
      throw httpError(400, 'Job not completed yet');
    }
  }

  async getHistory(user?: AuthUser | null, sessionId?: string) {
    if (!user && !sessionId) {
      throw httpError(400, 'User or session required');
    }

    if (user) {
      const rows = await this.generationRepository.findJobsByUserId(user.id);
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

    const rows = await this.generationRepository.findJobsBySessionId(
      sessionId as string,
    );
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

  private canAccess(job: GenerationJob, user?: AuthUser | null, sessionId?: string) {
    if (user && job.userId === user.id) return true;
    if (!job.userId && sessionId && job.sessionId === sessionId) return true;
    if (sessionId && job.sessionId && job.sessionId === sessionId) return true;
    return false;
  }

  private async processJob(jobId: string) {
    const jobRow = await this.generationRepository.findJobById(jobId);
    if (!jobRow) return;

    const job = rowToGenerationJob(jobRow);

    if (!job.uploadedImageId) {
      await this.generationRepository.updateJobFailed(
        jobId,
        'Uploaded image missing',
      );
      return;
    }

    const imageRow = await this.generationRepository.findUploadedImageById(
      job.uploadedImageId,
    );

    if (!imageRow) {
      await this.generationRepository.updateJobFailed(
        jobId,
        'Uploaded image not found',
      );
      return;
    }

    const uploadedImage = rowToUploadedImage(imageRow);

    await this.generationRepository.updateJobProcessing(jobId, new Date());

    try {
      const imageBuffer = await this.storageService.getObjectBuffer(
        uploadedImage.storageKey,
      );

      const generationResult = await this.genAIService.generateImages(
        imageBuffer,
        job.variationCount,
      );

      const { images } = generationResult;
      const expiresDays = config.cleanup.generatedImagesDays || 7;
      const expiresAt = new Date(
        Date.now() + expiresDays * 24 * 60 * 60 * 1000,
      );

      for (let i = 0; i < images.length; i += 1) {
        const gen = images[i];
        const mimeType = gen.mimeType || 'image/png';
        const originalBuffer = Buffer.from(gen.data, 'base64');
        const { buffer: normalizedBuffer, mimeType: outputMimeType } =
          await this.watermarkService.normalizeToSquare(
            originalBuffer,
            mimeType,
          );

        const unwatermarkedKey = `generated/${job.id}/variation-${i + 1}-full.png`;
        await this.storageService.uploadObject(
          unwatermarkedKey,
          normalizedBuffer,
          outputMimeType,
        );

        await this.generationRepository.insertGeneratedImage({
          jobId,
          variationIndex: i + 1,
          storageKey: unwatermarkedKey,
          mimeType: outputMimeType,
          fileSize: normalizedBuffer.length,
          expiresAt,
          isPermanent: false,
          isPreview: false,
        });

        const watermarkedBuffer = await this.watermarkService.applyPreviewWatermark(
          normalizedBuffer,
          outputMimeType,
        );

        const previewKey = `generated/${job.id}/variation-${i + 1}-preview.png`;
        await this.storageService.uploadObject(
          previewKey,
          watermarkedBuffer,
          outputMimeType,
        );

        await this.generationRepository.insertGeneratedImage({
          jobId,
          variationIndex: i + 1,
          storageKey: previewKey,
          mimeType: outputMimeType,
          fileSize: watermarkedBuffer.length,
          expiresAt,
          isPermanent: false,
          isPreview: true,
        });
      }

      if (job.sessionId && !job.userId) {
        await this.quotasService.incrementUsage(
          job.sessionId,
          job.variationCount,
        );
      }

      await this.generationRepository.updateJobCompleted(jobId, new Date());

      if (this.ordersService) {
        try {
          await this.ordersService.composeForGenerationJob(jobId);
        } catch (error) {
          this.logger.warn(
            `Failed to compose order images after generation ${jobId}: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof RateLimitExceededException
          ? `Rate limit exceeded: ${error.message}`
          : (error as Error).message;

      await this.generationRepository.updateJobFailed(jobId, errorMessage);
      throw error;
    }
  }
}

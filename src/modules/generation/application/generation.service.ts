import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { User } from '@buiducnhat/nest-better-auth';
import { ImagesService } from '../../images/application/images.service';
import { StorageService } from '../../storage/infrastructure/storage.service';
import { GenAIService } from '../../genai/infrastructure/genai.service';
import { QuotasService } from '../../quotas/application/quotas.service';
import { WatermarkService } from '../../watermark/application/watermark.service';
import {
  GenerationJob,
  GenerationJobStatus,
  rowToGenerationJob,
} from '../domain/entities/generation-job.entity';
import { rowToGeneratedImage } from '../domain/entities/generated-image.entity';
import { rowToUploadedImage } from '../../images/domain/entities/image.entity';
import { gridConfigs } from '../../grid-configs/domain/data/grid-configs.data';
import { GENERATION_QUEUE } from '../../queue/infrastructure/queue.module';
import type { GenerationJobData } from '../infrastructure/generation.processor';
import {
  IGenerationRepository,
  IGenerationRepositoryToken,
} from '../domain/generation.repository.interface';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    @Inject(IGenerationRepositoryToken)
    private readonly generationRepository: IGenerationRepository,
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

    const row = await this.generationRepository.createJob({
      userId,
      sessionId: sessionId ?? null,
      uploadedImageId,
      gridConfigId,
      variationCount,
    });

    const job = rowToGenerationJob(row);

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
    const row = await this.generationRepository.findJobById(jobId);
    if (!row) throw new NotFoundException('Job not found');

    const job = rowToGenerationJob(row);

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
    const jobRow = await this.generationRepository.findJobById(jobId);
    if (!jobRow) throw new NotFoundException('Job not found');

    const job = rowToGenerationJob(jobRow);

    if (!this.canAccess(job, user, sessionId)) {
      throw new ForbiddenException('Access denied');
    }

    if (job.status !== 'completed') {
      throw new BadRequestException('Job not completed yet');
    }

    // Only return preview (watermarked) images to the frontend
    const generatedRows = await this.generationRepository.findGeneratedImagesByJobId(
      jobId,
      true,
    );

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
    } else {
      const rows = await this.generationRepository.findJobsBySessionId(sessionId as string);
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

    // Get uploaded image
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

    // Update status to processing
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

        await this.generationRepository.insertGeneratedImage({
          jobId,
          variationIndex: i + 1,
          storageKey: key,
          mimeType,
          fileSize: buffer.length,
          expiresAt,
          isPermanent: false,
          isPreview: true,
        });
      }

      // Increment quota for anonymous users after successful generation
      if (job.sessionId && !job.userId) {
        await this.quotasService.incrementUsage(job.sessionId, job.variationCount);
        this.logger.debug(`Incremented quota for session ${job.sessionId}`);
      }

      await this.generationRepository.updateJobCompleted(jobId, new Date());
    } catch (err) {
      await this.generationRepository.updateJobFailed(
        jobId,
        (err as Error).message,
      );
    }
  }
}

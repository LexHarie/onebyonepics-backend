import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImagesService } from '../images/images.service';
import { StorageService } from '../storage/storage.service';
import { GenAIService } from '../genai/genai.service';
import { GenerationJob, GenerationJobStatus } from './entities/generation-job.entity';
import { GeneratedImage } from './entities/generated-image.entity';
import { User } from '../users/entities/user.entity';
import { ConfigService } from '@nestjs/config';
import { gridConfigs } from '../grid-configs/data/grid-configs.data';

@Injectable()
export class GenerationService {
  constructor(
    @InjectRepository(GenerationJob)
    private readonly jobsRepository: Repository<GenerationJob>,
    @InjectRepository(GeneratedImage)
    private readonly generatedImagesRepository: Repository<GeneratedImage>,
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

    const job = this.jobsRepository.create({
      user: user || null,
      sessionId,
      uploadedImage: image,
      gridConfigId,
      variationCount,
      status: 'pending',
    });

    const saved = await this.jobsRepository.save(job);

    // Fire and forget processing
    this.processJob(saved.id).catch((err) => {
      // error is handled inside processJob, swallow to avoid unhandled rejection
      return err;
    });

    return { jobId: saved.id, status: saved.status };
  }

  async getStatus(jobId: string, user?: User | null, sessionId?: string) {
    const job = await this.jobsRepository.findOne({
      where: { id: jobId },
      relations: ['user'],
    });
    if (!job) throw new NotFoundException('Job not found');
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
    const job = await this.jobsRepository.findOne({
      where: { id: jobId },
      relations: ['generatedImages', 'user'],
    });

    if (!job) throw new NotFoundException('Job not found');
    if (!this.canAccess(job, user, sessionId)) {
      throw new ForbiddenException('Access denied');
    }

    if (job.status !== 'completed') {
      throw new BadRequestException('Job not completed yet');
    }

    const images = await Promise.all(
      job.generatedImages
        .sort((a, b) => a.variationIndex - b.variationIndex)
        .map(async (img) => {
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

    const jobs = await this.jobsRepository.find({
      where: user ? { user: { id: user.id } } : { sessionId },
      relations: ['generatedImages'],
      order: { createdAt: 'DESC' },
    });

    return jobs.map((job) => ({
      id: job.id,
      gridConfigId: job.gridConfigId,
      variationCount: job.variationCount,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    }));
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
    if (user && job.user?.id === user.id) return true;
    if (!job.user && sessionId && job.sessionId === sessionId) return true;
    if (sessionId && job.sessionId && job.sessionId === sessionId) return true;
    return false;
  }

  private async processJob(jobId: string) {
    const job = await this.jobsRepository.findOne({
      where: { id: jobId },
      relations: ['uploadedImage'],
    });

    if (!job) return;
    if (!job.uploadedImage) {
      job.status = 'failed';
      job.errorMessage = 'Uploaded image missing';
      await this.jobsRepository.save(job);
      return;
    }

    job.status = 'processing';
    job.startedAt = new Date();
    await this.jobsRepository.save(job);

    try {
      const imageBuffer = await this.storageService.getObjectBuffer(
        job.uploadedImage.storageKey,
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

      const generatedImages: GeneratedImage[] = [];
      for (let i = 0; i < generated.length; i++) {
        const gen = generated[i];
        const mimeType = gen.mimeType || 'image/png';
        const buffer = Buffer.from(gen.data, 'base64');
        const key = `generated/${job.id}/variation-${i + 1}.png`;
        const url = await this.storageService.uploadObject(key, buffer, mimeType);
        const entity = this.generatedImagesRepository.create({
          generationJob: job,
          variationIndex: i + 1,
          storageKey: key,
          storageUrl: url,
          mimeType,
          fileSize: buffer.length,
          expiresAt,
        });
        generatedImages.push(entity);
      }

      job.generatedImages = generatedImages;
      job.status = 'completed';
      job.completedAt = new Date();
      await this.jobsRepository.save(job);
    } catch (err) {
      job.status = 'failed';
      job.errorMessage = (err as Error).message;
      await this.jobsRepository.save(job);
    }
  }
}

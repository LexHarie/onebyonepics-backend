import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { UploadedImage } from '../images/entities/image.entity';
import { GeneratedImage } from '../generation/entities/generated-image.entity';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @InjectRepository(UploadedImage)
    private readonly uploadsRepository: Repository<UploadedImage>,
    @InjectRepository(GeneratedImage)
    private readonly generatedRepository: Repository<GeneratedImage>,
    private readonly storageService: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    const now = new Date();
    await this.cleanupUploads(now);
    await this.cleanupGenerated(now);
  }

  private async cleanupUploads(now: Date) {
    const expired = await this.uploadsRepository.find({
      where: { expiresAt: LessThan(now) },
    });

    for (const upload of expired) {
      await this.storageService.deleteObject(upload.storageKey);
      await this.uploadsRepository.remove(upload);
    }

    if (expired.length) {
      this.logger.log(`Cleaned ${expired.length} expired uploads`);
    }
  }

  private async cleanupGenerated(now: Date) {
    const expired = await this.generatedRepository.find({
      where: { expiresAt: LessThan(now) },
    });

    for (const item of expired) {
      await this.storageService.deleteObject(item.storageKey);
      await this.generatedRepository.remove(item);
    }

    if (expired.length) {
      this.logger.log(`Cleaned ${expired.length} generated images`);
    }
  }
}

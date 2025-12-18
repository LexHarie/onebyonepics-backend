import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StorageService } from '../storage/storage.service';
import { rowToUploadedImage } from '../images/entities/image.entity';
import { rowToGeneratedImage } from '../generation/entities/generated-image.entity';
import { CLEANUP_REPOSITORY, CleanupRepositoryInterface } from './cleanup.repository';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @Inject(CLEANUP_REPOSITORY)
    private readonly cleanupRepository: CleanupRepositoryInterface,
    private readonly storageService: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    const now = new Date();
    await this.cleanupUploads(now);
    await this.cleanupGenerated(now);
  }

  private async cleanupUploads(now: Date) {
    const expiredRows = await this.cleanupRepository.findExpiredUploads(now);

    const expired = expiredRows.map(rowToUploadedImage);

    for (const upload of expired) {
      await this.storageService.deleteObject(upload.storageKey);
      await this.cleanupRepository.deleteUploadById(upload.id);
    }

    if (expired.length) {
      this.logger.log(`Cleaned ${expired.length} expired uploads`);
    }
  }

  private async cleanupGenerated(now: Date) {
    const expiredRows = await this.cleanupRepository.findExpiredGenerated(now);

    const expired = expiredRows.map(rowToGeneratedImage);

    for (const item of expired) {
      await this.storageService.deleteObject(item.storageKey);
      await this.cleanupRepository.deleteGeneratedById(item.id);
    }

    if (expired.length) {
      this.logger.log(`Cleaned ${expired.length} generated images`);
    }
  }
}

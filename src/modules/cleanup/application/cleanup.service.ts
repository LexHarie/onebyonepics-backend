import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StorageService } from '../../storage/infrastructure/storage.service';
import { rowToUploadedImage } from '../../images/domain/entities/image.entity';
import { rowToGeneratedImage } from '../../generation/domain/entities/generated-image.entity';
import {
  ICleanupRepositoryToken,
  type ICleanupRepository,
} from '../domain/cleanup.repository.interface';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    @Inject(ICleanupRepositoryToken)
    private readonly cleanupRepository: ICleanupRepository,
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

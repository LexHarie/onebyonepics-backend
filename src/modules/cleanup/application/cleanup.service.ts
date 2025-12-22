import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StorageService } from '../../storage/infrastructure/storage.service';
import { rowToUploadedImage } from '../../images/domain/entities/image.entity';
import { rowToGeneratedImage } from '../../generation/domain/entities/generated-image.entity';
import {
  logFailedResults,
  processInBatchesSettled,
} from '../../../common/utils/concurrency';
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

    if (!expired.length) {
      return;
    }

    const results = await processInBatchesSettled(expired, async (upload) => {
      await this.storageService.deleteObject(upload.storageKey);
      await this.cleanupRepository.deleteUploadById(upload.id);
    });

    logFailedResults(results, 'cleanupUploads', this.logger);

    const successful = results.filter((result) => result.status === 'fulfilled').length;
    if (successful > 0) {
      this.logger.log(`Cleaned ${successful} expired uploads`);
    }
  }

  private async cleanupGenerated(now: Date) {
    const expiredRows = await this.cleanupRepository.findExpiredGenerated(now);

    const expired = expiredRows.map(rowToGeneratedImage);

    if (!expired.length) {
      return;
    }

    const results = await processInBatchesSettled(expired, async (item) => {
      await this.storageService.deleteObject(item.storageKey);
      await this.cleanupRepository.deleteGeneratedById(item.id);
    });

    logFailedResults(results, 'cleanupGenerated', this.logger);

    const successful = results.filter((result) => result.status === 'fulfilled').length;
    if (successful > 0) {
      this.logger.log(`Cleaned ${successful} generated images`);
    }
  }
}

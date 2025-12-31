import { processInBatchesSettled, logFailedResults } from '../../lib/concurrency';
import { rowToUploadedImage } from '../images/domain/entities/image.entity';
import { rowToGeneratedImage } from '../generation/domain/entities/generated-image.entity';
import type { ICleanupRepository } from './domain/cleanup.repository.interface';
import { StorageService } from '../storage/storage.service';

export class CleanupService {
  constructor(
    private readonly cleanupRepository: ICleanupRepository,
    private readonly storageService: StorageService,
  ) {}

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

    logFailedResults(results, 'cleanupUploads');
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

    logFailedResults(results, 'cleanupGenerated');
  }
}

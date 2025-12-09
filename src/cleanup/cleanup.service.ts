import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { UploadedImageRow, rowToUploadedImage } from '../images/entities/image.entity';
import { GeneratedImageRow, rowToGeneratedImage } from '../generation/entities/generated-image.entity';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    const now = new Date();
    await this.cleanupUploads(now);
    await this.cleanupGenerated(now);
  }

  private async cleanupUploads(now: Date) {
    const expiredRows = await this.db.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE expires_at < ${now}
    `;

    const expired = expiredRows.map(rowToUploadedImage);

    for (const upload of expired) {
      await this.storageService.deleteObject(upload.storageKey);
      await this.db.sql`DELETE FROM uploaded_images WHERE id = ${upload.id}`;
    }

    if (expired.length) {
      this.logger.log(`Cleaned ${expired.length} expired uploads`);
    }
  }

  private async cleanupGenerated(now: Date) {
    const expiredRows = await this.db.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images WHERE expires_at < ${now}
    `;

    const expired = expiredRows.map(rowToGeneratedImage);

    for (const item of expired) {
      await this.storageService.deleteObject(item.storageKey);
      await this.db.sql`DELETE FROM generated_images WHERE id = ${item.id}`;
    }

    if (expired.length) {
      this.logger.log(`Cleaned ${expired.length} generated images`);
    }
  }
}

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/infrastructure/database.service';
import { UploadedImageRow } from '../../../../images/domain/entities/image.entity';
import { GeneratedImageRow } from '../../../../generation/domain/entities/generated-image.entity';
import { ICleanupRepository } from '../../../domain/cleanup.repository.interface';

@Injectable()
export class CleanupRepository implements ICleanupRepository {
  constructor(private readonly db: DatabaseService) {}

  async findExpiredUploads(now: Date): Promise<UploadedImageRow[]> {
    return this.db.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE expires_at < ${now}
    `;
  }

  async deleteUploadById(id: string): Promise<void> {
    await this.db.sql`DELETE FROM uploaded_images WHERE id = ${id}`;
  }

  async findExpiredGenerated(now: Date): Promise<GeneratedImageRow[]> {
    return this.db.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images WHERE expires_at < ${now}
    `;
  }

  async deleteGeneratedById(id: string): Promise<void> {
    await this.db.sql`DELETE FROM generated_images WHERE id = ${id}`;
  }
}

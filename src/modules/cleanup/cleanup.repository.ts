import type { SQL } from 'bun';
import { getSql } from '../../lib/database';
import type { UploadedImageRow } from '../images/domain/entities/image.entity';
import type { GeneratedImageRow } from '../generation/domain/entities/generated-image.entity';
import type { ICleanupRepository } from './domain/cleanup.repository.interface';

export class CleanupRepository implements ICleanupRepository {
  constructor(private readonly sql: SQL) {}

  async findExpiredUploads(now: Date): Promise<UploadedImageRow[]> {
    return this.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE expires_at < ${now}
    `;
  }

  async deleteUploadById(id: string): Promise<void> {
    await this.sql`DELETE FROM uploaded_images WHERE id = ${id}`;
  }

  async findExpiredGenerated(now: Date): Promise<GeneratedImageRow[]> {
    return this.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images WHERE expires_at < ${now}
    `;
  }

  async deleteGeneratedById(id: string): Promise<void> {
    await this.sql`DELETE FROM generated_images WHERE id = ${id}`;
  }
}

export const createCleanupRepository = () => new CleanupRepository(getSql());

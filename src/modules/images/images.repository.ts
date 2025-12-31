import type { SQL } from 'bun';
import type { UploadedImageRow } from './domain/entities/image.entity';
import type { IImagesRepository } from './domain/images.repository.interface';
import { getSql } from '../../lib/database';

export class ImagesRepository implements IImagesRepository {
  constructor(private readonly sql: SQL) {}

  async insertUploadedImage(params: {
    userId: string | null;
    sessionId: string | null;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    originalFilename: string | null;
    expiresAt: Date;
  }): Promise<UploadedImageRow> {
    const rows = await this.sql<UploadedImageRow[]>`
      INSERT INTO uploaded_images (
        user_id, session_id, storage_key,
        mime_type, file_size, original_filename, expires_at
      )
      VALUES (
        ${params.userId}, ${params.sessionId}, ${params.storageKey},
        ${params.mimeType}, ${params.fileSize}, ${params.originalFilename}, ${params.expiresAt}
      )
      RETURNING *
    `;

    return rows[0];
  }

  async findById(id: string): Promise<UploadedImageRow | null> {
    const rows = await this.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE id = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async deleteById(id: string): Promise<void> {
    await this.sql`DELETE FROM uploaded_images WHERE id = ${id}`;
  }
}

export const createImagesRepository = () => new ImagesRepository(getSql());

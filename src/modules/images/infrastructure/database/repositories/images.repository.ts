import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/infrastructure/database.service';
import { UploadedImageRow } from '../../../domain/entities/image.entity';
import { IImagesRepository } from '../../../domain/images.repository.interface';

@Injectable()
export class ImagesRepository implements IImagesRepository {
  constructor(private readonly db: DatabaseService) {}

  async insertUploadedImage(params: {
    userId: string | null;
    sessionId: string | null;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    originalFilename: string | null;
    expiresAt: Date;
  }): Promise<UploadedImageRow> {
    const rows = await this.db.sql<UploadedImageRow[]>`
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
    const rows = await this.db.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE id = ${id} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.sql`DELETE FROM uploaded_images WHERE id = ${id}`;
  }
}

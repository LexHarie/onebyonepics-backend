import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'node:path';
import { DatabaseService } from '../database/database.service';
import type { User } from '../users/entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { UploadedImage, UploadedImageRow, rowToUploadedImage } from './entities/image.entity';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

@Injectable()
export class ImagesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async uploadImage(params: {
    user?: User | null;
    sessionId?: string;
    file: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<UploadedImage> {
    const { user, sessionId, file, mimeType, filename } = params;

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException('Unsupported file type');
    }

    if (!file?.length) {
      throw new BadRequestException('Invalid file');
    }

    const ext = extname(filename || '').replace('.', '') || 'jpg';
    const key = `uploads/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storageService.uploadObject(key, file, mimeType);

    const hours = this.configService.get<number>('cleanup.originalImagesHours') || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const userId = user?.id ?? null;

    const rows = await this.db.sql<UploadedImageRow[]>`
      INSERT INTO uploaded_images (
        user_id, session_id, storage_key,
        mime_type, file_size, original_filename, expires_at
      )
      VALUES (
        ${userId}, ${sessionId ?? null}, ${key},
        ${mimeType}, ${file.length}, ${filename ?? null}, ${expiresAt}
      )
      RETURNING *
    `;

    return rowToUploadedImage(rows[0]);
  }

  /**
   * Get a signed URL for accessing an uploaded image
   */
  async getSignedUrl(image: UploadedImage, expiresInSeconds = 3600): Promise<string> {
    return this.storageService.getSignedUrl(image.storageKey, expiresInSeconds);
  }

  async findById(id: string): Promise<UploadedImage | null> {
    const rows = await this.db.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE id = ${id} LIMIT 1
    `;
    return rows.length > 0 ? rowToUploadedImage(rows[0]) : null;
  }

  async getImageForRequester(
    id: string,
    user?: User | null,
    sessionId?: string,
  ): Promise<UploadedImage> {
    const image = await this.findById(id);
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (!this.canAccess(image, user, sessionId)) {
      throw new ForbiddenException('Access denied');
    }

    return image;
  }

  private canAccess(image: UploadedImage, user?: User | null, sessionId?: string) {
    if (user && image.userId === user.id) return true;
    if (!user && sessionId && image.sessionId && image.sessionId === sessionId)
      return true;
    if (!image.userId && image.sessionId && sessionId === image.sessionId) return true;
    return false;
  }

  async deleteImage(id: string, user?: User | null, sessionId?: string) {
    const image = await this.getImageForRequester(id, user, sessionId);
    await this.storageService.deleteObject(image.storageKey);
    await this.db.sql`DELETE FROM uploaded_images WHERE id = ${id}`;
    return { success: true };
  }
}

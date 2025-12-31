import { randomUUID } from 'crypto';
import { extname } from 'node:path';
import type { AuthUser } from '../../guards/auth.guard';
import { config } from '../../config/env';
import { httpError } from '../../lib/http-error';
import { StorageService } from '../storage/storage.service';
import {
  rowToUploadedImage,
  type UploadedImage,
} from './domain/entities/image.entity';
import type { IImagesRepository } from './domain/images.repository.interface';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

export class ImagesService {
  constructor(
    private readonly imagesRepository: IImagesRepository,
    private readonly storageService: StorageService,
  ) {}

  async uploadImage(params: {
    user?: AuthUser | null;
    sessionId?: string;
    file: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<UploadedImage> {
    const { user, sessionId, file, mimeType, filename } = params;

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw httpError(400, 'Unsupported file type');
    }

    if (!file?.length) {
      throw httpError(400, 'Invalid file');
    }

    const ext = extname(filename || '').replace('.', '') || 'jpg';
    const key = `uploads/${Date.now()}-${randomUUID()}.${ext}`;
    await this.storageService.uploadObject(key, file, mimeType);

    const hours = config.cleanup.originalImagesHours || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const userId = user?.id ?? null;

    const row = await this.imagesRepository.insertUploadedImage({
      userId,
      sessionId: sessionId ?? null,
      storageKey: key,
      mimeType,
      fileSize: file.length,
      originalFilename: filename ?? null,
      expiresAt,
    });

    return rowToUploadedImage(row);
  }

  async getSignedUrl(image: UploadedImage, expiresInSeconds = 3600): Promise<string> {
    return this.storageService.getSignedUrl(image.storageKey, expiresInSeconds);
  }

  async findById(id: string): Promise<UploadedImage | null> {
    const row = await this.imagesRepository.findById(id);
    return row ? rowToUploadedImage(row) : null;
  }

  async getImageForRequester(
    id: string,
    user?: AuthUser | null,
    sessionId?: string,
  ): Promise<UploadedImage> {
    const image = await this.findById(id);
    if (!image) {
      throw httpError(404, 'Image not found');
    }

    if (!this.canAccess(image, user, sessionId)) {
      throw httpError(403, 'Access denied');
    }

    return image;
  }

  private canAccess(image: UploadedImage, user?: AuthUser | null, sessionId?: string) {
    if (user && image.userId === user.id) return true;
    if (!user && sessionId && image.sessionId && image.sessionId === sessionId) {
      return true;
    }
    if (!image.userId && image.sessionId && sessionId === image.sessionId) {
      return true;
    }
    return false;
  }

  async deleteImage(id: string, user?: AuthUser | null, sessionId?: string) {
    const image = await this.getImageForRequester(id, user, sessionId);
    await this.storageService.deleteObject(image.storageKey);
    await this.imagesRepository.deleteById(id);
    return { success: true };
  }
}

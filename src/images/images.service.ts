import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'node:path';
import type { User } from '@buiducnhat/nest-better-auth';
import { StorageService } from '../storage/storage.service';
import { UploadedImage, rowToUploadedImage } from './entities/image.entity';
import { IMAGES_REPOSITORY, ImagesRepositoryInterface } from './images.repository';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

@Injectable()
export class ImagesService {
  constructor(
    @Inject(IMAGES_REPOSITORY)
    private readonly imagesRepository: ImagesRepositoryInterface,
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

  /**
   * Get a signed URL for accessing an uploaded image
   */
  async getSignedUrl(image: UploadedImage, expiresInSeconds = 3600): Promise<string> {
    return this.storageService.getSignedUrl(image.storageKey, expiresInSeconds);
  }

  async findById(id: string): Promise<UploadedImage | null> {
    const row = await this.imagesRepository.findById(id);
    return row ? rowToUploadedImage(row) : null;
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
    await this.imagesRepository.deleteById(id);
    return { success: true };
  }
}

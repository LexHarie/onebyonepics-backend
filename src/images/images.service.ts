import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'node:path';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { UploadedImage } from './entities/image.entity';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];

@Injectable()
export class ImagesService {
  constructor(
    @InjectRepository(UploadedImage)
    private readonly imagesRepository: Repository<UploadedImage>,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async uploadImage(params: {
    user?: User | null;
    sessionId?: string;
    file: Buffer;
    filename: string;
    mimeType: string;
  }) {
    const { user, sessionId, file, mimeType, filename } = params;

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new BadRequestException('Unsupported file type');
    }

    if (!file?.length) {
      throw new BadRequestException('Invalid file');
    }

    const ext = extname(filename || '').replace('.', '') || 'jpg';
    const key = `uploads/${Date.now()}-${randomUUID()}.${ext}`;
    const url = await this.storageService.uploadObject(key, file, mimeType);

    const hours = this.configService.get<number>('cleanup.originalImagesHours') || 24;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const image = this.imagesRepository.create({
      user: user || null,
      sessionId,
      storageKey: key,
      storageUrl: url,
      mimeType,
      fileSize: file.length,
      originalFilename: filename,
      expiresAt,
    });

    const saved = await this.imagesRepository.save(image);
    return saved;
  }

  async findById(id: string) {
    return this.imagesRepository.findOne({ where: { id }, relations: ['user'] });
  }

  async getImageForRequester(
    id: string,
    user?: User | null,
    sessionId?: string,
  ) {
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
    if (user && image.user?.id === user.id) return true;
    if (!user && sessionId && image.sessionId && image.sessionId === sessionId)
      return true;
    if (!image.user && image.sessionId && sessionId === image.sessionId) return true;
    return false;
  }

  async deleteImage(id: string, user?: User | null, sessionId?: string) {
    const image = await this.getImageForRequester(id, user, sessionId);
    await this.storageService.deleteObject(image.storageKey);
    await this.imagesRepository.remove(image);
    return { success: true };
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CleanupService } from './cleanup.service';
import { UploadedImage } from '../images/entities/image.entity';
import { GeneratedImage } from '../generation/entities/generated-image.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([UploadedImage, GeneratedImage]), StorageModule],
  providers: [CleanupService],
})
export class CleanupModule {}

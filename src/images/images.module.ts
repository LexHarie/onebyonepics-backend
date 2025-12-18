import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { IMAGES_REPOSITORY, ImagesRepository } from './images.repository';
import { StorageModule } from '../storage/storage.module';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';

@Module({
  imports: [StorageModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    { provide: IMAGES_REPOSITORY, useClass: ImagesRepository },
    OptionalAuthGuard,
  ],
  exports: [ImagesService],
})
export class ImagesModule {}

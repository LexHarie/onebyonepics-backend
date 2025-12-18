import { Module } from '@nestjs/common';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { StorageModule } from '../storage/storage.module';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';

@Module({
  imports: [StorageModule],
  controllers: [ImagesController],
  providers: [ImagesService, OptionalAuthGuard],
  exports: [ImagesService],
})
export class ImagesModule {}

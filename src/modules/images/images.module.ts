import { Module } from '@nestjs/common';
import { ImagesController } from './interfaces/controllers/images.controller';
import { ImagesService } from './application/images.service';
import { ImagesRepositoryInterfaces } from './infrastructure/index.interface';
import { StorageModule } from '../storage/storage.module';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';

@Module({
  imports: [StorageModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    ...ImagesRepositoryInterfaces,
    OptionalAuthGuard,
  ],
  exports: [ImagesService],
})
export class ImagesModule {}

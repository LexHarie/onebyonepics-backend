import { Module } from '@nestjs/common';
import { CleanupService } from '../application/cleanup.service';
import { CleanupRepositoryInterfaces } from './index.interface';
import { StorageModule } from '../../storage/infrastructure/storage.module';

@Module({
  imports: [StorageModule],
  providers: [CleanupService, ...CleanupRepositoryInterfaces],
})
export class CleanupModule {}

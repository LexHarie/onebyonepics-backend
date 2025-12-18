import { Module } from '@nestjs/common';
import { CleanupService } from './application/cleanup.service';
import { CleanupRepositoryInterfaces } from './infrastructure/index.interface';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [CleanupService, ...CleanupRepositoryInterfaces],
})
export class CleanupModule {}

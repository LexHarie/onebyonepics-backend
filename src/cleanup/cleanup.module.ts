import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { CleanupRepositoryInterfaces } from './index.interface';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [CleanupService, ...CleanupRepositoryInterfaces],
})
export class CleanupModule {}

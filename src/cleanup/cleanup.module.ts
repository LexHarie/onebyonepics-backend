import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { CLEANUP_REPOSITORY, CleanupRepository } from './cleanup.repository';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [CleanupService, { provide: CLEANUP_REPOSITORY, useClass: CleanupRepository }],
})
export class CleanupModule {}

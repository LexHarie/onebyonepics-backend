import { Module } from '@nestjs/common';
import { CleanupService } from './cleanup.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [CleanupService],
})
export class CleanupModule {}

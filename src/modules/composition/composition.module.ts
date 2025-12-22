import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CompositionService } from './application/composition.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ConfigModule, StorageModule],
  providers: [CompositionService],
  exports: [CompositionService],
})
export class CompositionModule {}

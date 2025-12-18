import { Module } from '@nestjs/common';
import { CompositionService } from '../application/composition.service';
import { StorageModule } from '../../storage/infrastructure/storage.module';

@Module({
  imports: [StorageModule],
  providers: [CompositionService],
  exports: [CompositionService],
})
export class CompositionModule {}

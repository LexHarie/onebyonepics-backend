import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenerationController } from './generation.controller';
import { GenerationService } from '../application/generation.service';
import { GenerationProcessor } from './generation.processor';
import { GenerationRepositoryInterfaces } from './index.interface';
import { ImagesModule } from '../../images/infrastructure/images.module';
import { StorageModule } from '../../storage/infrastructure/storage.module';
import { GenAIModule } from '../../genai/infrastructure/genai.module';
import { QuotasModule } from '../../quotas/infrastructure/quotas.module';
import { WatermarkModule } from '../../watermark/infrastructure/watermark.module';
import { QueueModule } from '../../queue/infrastructure/queue.module';
import { OptionalAuthGuard } from '../../../common/guards/optional-auth.guard';

@Module({
  imports: [
    ConfigModule,
    ImagesModule,
    StorageModule,
    GenAIModule,
    QuotasModule,
    WatermarkModule,
    QueueModule,
  ],
  controllers: [GenerationController],
  providers: [
    GenerationService,
    GenerationProcessor,
    ...GenerationRepositoryInterfaces,
    OptionalAuthGuard,
  ],
  exports: [GenerationService],
})
export class GenerationModule {}

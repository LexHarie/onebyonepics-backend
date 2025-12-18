import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationProcessor } from './generation.processor';
import { GENERATION_REPOSITORY, GenerationRepository } from './generation.repository';
import { ImagesModule } from '../images/images.module';
import { StorageModule } from '../storage/storage.module';
import { GenAIModule } from '../genai/genai.module';
import { QuotasModule } from '../quotas/quotas.module';
import { WatermarkModule } from '../watermark/watermark.module';
import { QueueModule } from '../queue/queue.module';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';

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
    { provide: GENERATION_REPOSITORY, useClass: GenerationRepository },
    OptionalAuthGuard,
  ],
  exports: [GenerationService],
})
export class GenerationModule {}

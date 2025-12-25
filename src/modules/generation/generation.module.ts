import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenerationController } from './interfaces/controllers/generation.controller';
import { GenerationService } from './application/generation.service';
import { GenerationQueueRecoveryService } from './application/generation-queue-recovery.service';
import { GenerationProcessor } from './infrastructure/workers/generation.processor';
import { GenerationRepositoryInterfaces } from './infrastructure/index.interface';
import { ImagesModule } from '../images/images.module';
import { StorageModule } from '../storage/storage.module';
import { GenAIModule } from '../genai/genai.module';
import { QuotasModule } from '../quotas/quotas.module';
import { WatermarkModule } from '../watermark/watermark.module';
import { QueueModule } from '../queue/queue.module';
import { OrdersModule } from '../orders/orders.module';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';

@Module({
  imports: [
    ConfigModule,
    ImagesModule,
    StorageModule,
    GenAIModule,
    QuotasModule,
    WatermarkModule,
    QueueModule,
    forwardRef(() => OrdersModule),
  ],
  controllers: [GenerationController],
  providers: [
    GenerationService,
    GenerationQueueRecoveryService,
    GenerationProcessor,
    ...GenerationRepositoryInterfaces,
    OptionalAuthGuard,
  ],
  exports: [GenerationService],
})
export class GenerationModule {}

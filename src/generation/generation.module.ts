import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationProcessor } from './generation.processor';
import { ImagesModule } from '../images/images.module';
import { StorageModule } from '../storage/storage.module';
import { GenAIModule } from '../genai/genai.module';
import { AuthModule } from '../auth/auth.module';
import { QuotasModule } from '../quotas/quotas.module';
import { WatermarkModule } from '../watermark/watermark.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    ConfigModule,
    ImagesModule,
    StorageModule,
    GenAIModule,
    AuthModule,
    QuotasModule,
    WatermarkModule,
    QueueModule,
  ],
  controllers: [GenerationController],
  providers: [GenerationService, GenerationProcessor],
  exports: [GenerationService],
})
export class GenerationModule {}

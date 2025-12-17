import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ImagesModule } from './images/images.module';
import { GenerationModule } from './generation/generation.module';
import { GridConfigsModule } from './grid-configs/grid-configs.module';
import { StorageModule } from './storage/storage.module';
import { GenAIModule } from './genai/genai.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { QuotasModule } from './quotas/quotas.module';
import { WatermarkModule } from './watermark/watermark.module';
import { RateLimiterModule } from './rate-limiter';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    RateLimiterModule,
    StorageModule,
    GenAIModule,
    UsersModule,
    AuthModule,
    ImagesModule,
    GenerationModule,
    GridConfigsModule,
    CleanupModule,
    OrdersModule,
    PaymentsModule,
    WebhooksModule,
    QuotasModule,
    WatermarkModule,
  ],
})
export class AppModule {}

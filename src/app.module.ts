import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule as BetterAuthModule } from '@buiducnhat/nest-better-auth';
import { ConfigModule } from './modules/config/config.module';
import { DatabaseModule } from './modules/database/database.module';
import { ImagesModule } from './modules/images/images.module';
import { GenerationModule } from './modules/generation/generation.module';
import { GridConfigsModule } from './modules/grid-configs/grid-configs.module';
import { StorageModule } from './modules/storage/storage.module';
import { GenAIModule } from './modules/genai/genai.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { QuotasModule } from './modules/quotas/quotas.module';
import { WatermarkModule } from './modules/watermark/watermark.module';
import { RateLimiterModule } from './modules/rate-limiter/rate-limiter.module';
import { SessionMigrationModule } from './modules/session-migration/session-migration.module';
import { auth } from './lib/auth';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    RateLimiterModule,
    StorageModule,
    GenAIModule,
    // BetterAuth for Google OAuth and session management
    BetterAuthModule.forRoot({
      betterAuth: auth,
      options: {
        routingProvider: 'fastify',
      },
    }),
    ImagesModule,
    GenerationModule,
    GridConfigsModule,
    CleanupModule,
    OrdersModule,
    PaymentsModule,
    WebhooksModule,
    QuotasModule,
    WatermarkModule,
    SessionMigrationModule,
  ],
})
export class AppModule {}

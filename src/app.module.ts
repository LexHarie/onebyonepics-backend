import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule as BetterAuthModule } from '@buiducnhat/nest-better-auth';
import { ConfigModule } from './modules/config/infrastructure/config.module';
import { DatabaseModule } from './modules/database/infrastructure/database.module';
import { ImagesModule } from './modules/images/infrastructure/images.module';
import { GenerationModule } from './modules/generation/infrastructure/generation.module';
import { GridConfigsModule } from './modules/grid-configs/infrastructure/grid-configs.module';
import { StorageModule } from './modules/storage/infrastructure/storage.module';
import { GenAIModule } from './modules/genai/infrastructure/genai.module';
import { CleanupModule } from './modules/cleanup/infrastructure/cleanup.module';
import { OrdersModule } from './modules/orders/infrastructure/orders.module';
import { PaymentsModule } from './modules/payments/infrastructure/payments.module';
import { WebhooksModule } from './modules/webhooks/infrastructure/webhooks.module';
import { QuotasModule } from './modules/quotas/infrastructure/quotas.module';
import { WatermarkModule } from './modules/watermark/infrastructure/watermark.module';
import { RateLimiterModule } from './modules/rate-limiter/infrastructure/rate-limiter.module';
import { SessionMigrationModule } from './modules/session-migration/infrastructure/session-migration.module';
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

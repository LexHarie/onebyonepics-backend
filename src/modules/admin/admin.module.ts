import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { StorageModule } from '../storage/storage.module';
import { AdminRepository } from './infrastructure/repositories/admin.repository';
import { AdminDashboardService } from './application/admin-dashboard.service';
import { AdminOrdersService } from './application/admin-orders.service';
import { AdminUsersService } from './application/admin-users.service';
import { AdminAnalyticsService } from './application/admin-analytics.service';
import { AdminGenerationService } from './application/admin-generation.service';
import { AdminSystemService } from './application/admin-system.service';
import { AdminDashboardController } from './interfaces/controllers/admin-dashboard.controller';
import { AdminOrdersController } from './interfaces/controllers/admin-orders.controller';
import { AdminUsersController } from './interfaces/controllers/admin-users.controller';
import { AdminAnalyticsController } from './interfaces/controllers/admin-analytics.controller';
import { AdminGenerationController } from './interfaces/controllers/admin-generation.controller';
import { AdminSystemController } from './interfaces/controllers/admin-system.controller';
import { AdminGuard } from './interfaces/guards/admin.guard';

@Module({
  imports: [
    DatabaseModule,
    QueueModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => WebhooksModule),
    StorageModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminOrdersController,
    AdminUsersController,
    AdminAnalyticsController,
    AdminGenerationController,
    AdminSystemController,
  ],
  providers: [
    AdminRepository,
    AdminDashboardService,
    AdminOrdersService,
    AdminUsersService,
    AdminAnalyticsService,
    AdminGenerationService,
    AdminSystemService,
    AdminGuard,
  ],
})
export class AdminModule {}

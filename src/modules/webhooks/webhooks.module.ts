import { Module } from '@nestjs/common';
import { WebhooksController } from './interfaces/controllers/webhooks.controller';
import { WebhookEventsService } from './application/webhook-events.service';
import { WebhookVerificationRetryService } from './application/webhook-verification-retry.service';
import { WebhookEventsRepositoryInterfaces } from './infrastructure/index.interface';
import { MayaWebhookIpGuard } from './interfaces/guards/maya-webhook-ip.guard';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [PaymentsModule, OrdersModule, DatabaseModule],
  controllers: [WebhooksController],
  providers: [
    WebhookEventsService,
    WebhookVerificationRetryService,
    MayaWebhookIpGuard,
    ...WebhookEventsRepositoryInterfaces,
  ],
  exports: [WebhookEventsService],
})
export class WebhooksModule {}

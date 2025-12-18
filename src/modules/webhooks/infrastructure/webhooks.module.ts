import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { PaymentsModule } from '../../payments/infrastructure/payments.module';
import { OrdersModule } from '../../orders/infrastructure/orders.module';

@Module({
  imports: [PaymentsModule, OrdersModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}

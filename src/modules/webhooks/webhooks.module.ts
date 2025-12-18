import { Module } from '@nestjs/common';
import { WebhooksController } from './interfaces/controllers/webhooks.controller';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [PaymentsModule, OrdersModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}

import type { OrdersService } from '../orders/orders.service';
import type { IWebhookEventsRepository } from './domain/webhook-events.repository.interface';
import {
  type PayMongoWebhookPayload,
  type PayMongoPaymentStatus,
  isCheckoutPaymentPaid,
  extractReferenceNumber,
  extractPaymentId,
  extractPaymentStatus,
  extractPaymentAmount,
} from './domain/entities/paymongo-webhook.types';
import type { WebhookEvent } from './domain/entities/webhook-event.entity';
import { AppLogger } from '../../lib/logger';

export interface ProcessWebhookResult {
  received: boolean;
  message?: string;
  error?: string;
}

export class WebhookEventsService {
  private readonly logger = new AppLogger('WebhookEventsService');

  constructor(
    private readonly webhookEventsRepository: IWebhookEventsRepository,
    private readonly ordersService: OrdersService,
  ) {}

  async processPayMongoWebhook(
    payload: PayMongoWebhookPayload,
  ): Promise<ProcessWebhookResult> {
    if (!isCheckoutPaymentPaid(payload)) {
      return { received: true, message: 'Event type not processed' };
    }

    const orderNumber = extractReferenceNumber(payload);
    const paymentId = extractPaymentId(payload);
    const paymentStatus = extractPaymentStatus(payload);
    const paymentAmount = extractPaymentAmount(payload);

    if (!orderNumber) {
      return { received: true, message: 'Missing reference number' };
    }

    const webhookEvent = await this.webhookEventsRepository.create({
      eventType: 'paymongo.checkout',
      paymongoPaymentId: paymentId,
      paymentProvider: 'paymongo',
      orderNumber,
      paymentStatus: this.mapPayMongoStatus(paymentStatus),
      fundSourceType: null,
      rawPayload: payload as unknown as Record<string, unknown>,
    });

    try {
      const order = await this.ordersService.findByOrderNumber(orderNumber);

      if (!order) {
        await this.webhookEventsRepository.markProcessed(
          webhookEvent.id,
          'Order not found',
        );
        return { received: true, message: 'Order not found' };
      }

      if (order.paymentStatus === 'paid') {
        await this.webhookEventsRepository.markProcessed(
          webhookEvent.id,
          'Duplicate - already paid',
        );
        return { received: true, message: 'Already processed' };
      }

      const amountDifference = Math.abs(paymentAmount - order.totalAmount);
      if (amountDifference > 1) {
        const error = `Amount mismatch: expected=${order.totalAmount}, got=${paymentAmount}`;
        await this.webhookEventsRepository.markProcessed(webhookEvent.id, error);
        return { received: true, message: 'Amount verification failed' };
      }

      if (paymentStatus === 'paid') {
        await this.ordersService.updatePaymentStatus(order.id, 'paid', paymentId ?? undefined);
        await this.triggerComposition(order.id, orderNumber);
      } else if (paymentStatus === 'failed') {
        await this.ordersService.updatePaymentStatus(order.id, 'failed');
      }

      await this.webhookEventsRepository.markProcessed(webhookEvent.id);
      return { received: true };
    } catch (error) {
      const errorMessage = (error as Error).message;
      await this.webhookEventsRepository.markProcessed(webhookEvent.id, errorMessage);
      return { received: true, error: errorMessage };
    }
  }

  private mapPayMongoStatus(status: PayMongoPaymentStatus): string {
    const statusMap: Record<PayMongoPaymentStatus, string> = {
      paid: 'PAYMENT_SUCCESS',
      pending: 'PENDING_PAYMENT',
      failed: 'PAYMENT_FAILED',
      expired: 'PAYMENT_EXPIRED',
      refunded: 'REFUNDED',
    };
    return statusMap[status] || 'PENDING_PAYMENT';
  }

  private async triggerComposition(orderId: string, orderNumber: string): Promise<void> {
    try {
      await this.ordersService.composeAndStoreImage(orderId);
    } catch (error) {
      this.logger.error(
        `Failed to compose image for order ${orderNumber}: ${(error as Error).message}`,
      );
    }
  }

  async getWebhookHistory(orderNumber: string): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findByOrderNumber(orderNumber);
  }

  async getByPayMongoPaymentId(
    paymentId: string,
  ): Promise<WebhookEvent | null> {
    return this.webhookEventsRepository.findByPayMongoPaymentId(paymentId);
  }

  async getUnprocessedWebhooks(limit?: number): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findUnprocessed(limit);
  }
}

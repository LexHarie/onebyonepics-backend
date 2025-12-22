import { Injectable, Inject, Logger } from '@nestjs/common';
import { OrdersService } from '../../orders/application/orders.service';
import { MayaService } from '../../payments/infrastructure/maya.service';
import type { IWebhookEventsRepository } from '../domain/webhook-events.repository.interface';
import { IWebhookEventsRepositoryToken } from '../domain/webhook-events.repository.interface';
import {
  type MayaWebhookPayload,
  type MayaPaymentWebhookPayload,
  type MayaPaymentStatus,
  isPaymentWebhook,
  isCheckoutWebhook,
  extractPaymentStatus,
  extractFundSourceType,
} from '../domain/entities/maya-webhook.types';
import type { WebhookEvent } from '../domain/entities/webhook-event.entity';

export interface ProcessWebhookResult {
  received: boolean;
  message?: string;
  error?: string;
}

@Injectable()
export class WebhookEventsService {
  private readonly logger = new Logger(WebhookEventsService.name);

  constructor(
    @Inject(IWebhookEventsRepositoryToken)
    private readonly webhookEventsRepository: IWebhookEventsRepository,
    private readonly ordersService: OrdersService,
    private readonly mayaService: MayaService,
  ) {}

  /**
   * Process incoming Maya webhook
   */
  async processMayaWebhook(
    payload: MayaWebhookPayload,
  ): Promise<ProcessWebhookResult> {
    const orderNumber = payload.requestReferenceNumber;
    const paymentStatus = extractPaymentStatus(payload);
    const fundSourceType = extractFundSourceType(payload);
    const eventType = isCheckoutWebhook(payload) ? 'maya.checkout' : 'maya.payment';

    this.logger.log(
      `Processing ${eventType} webhook for order ${orderNumber}: ` +
        `status=${paymentStatus}, fundSource=${fundSourceType}`,
    );

    // 1. Store raw webhook event for audit
    const webhookEvent = await this.webhookEventsRepository.create({
      eventType,
      mayaPaymentId: payload.id,
      orderNumber,
      paymentStatus,
      fundSourceType,
      rawPayload: payload as unknown as Record<string, unknown>,
    });

    this.logger.debug(`Stored webhook event ${webhookEvent.id}`);

    try {
      // 2. Find associated order
      const order = await this.ordersService.findByOrderNumber(orderNumber);

      if (!order) {
        this.logger.warn(`Order not found for webhook: ${orderNumber}`);
        await this.webhookEventsRepository.markProcessed(
          webhookEvent.id,
          'Order not found',
        );
        return { received: true, message: 'Order not found' };
      }

      // 3. Process based on payment status
      await this.handlePaymentStatus(payload, order.id, paymentStatus);

      // 4. Mark webhook as processed
      await this.webhookEventsRepository.markProcessed(webhookEvent.id);

      this.logger.log(`Successfully processed webhook for order ${orderNumber}`);
      return { received: true };
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(
        `Error processing webhook for order ${orderNumber}: ${errorMessage}`,
      );
      await this.webhookEventsRepository.markProcessed(webhookEvent.id, errorMessage);
      return { received: true, error: errorMessage };
    }
  }

  /**
   * Handle payment based on status
   */
  private async handlePaymentStatus(
    payload: MayaWebhookPayload,
    orderId: string,
    status: MayaPaymentStatus,
  ): Promise<void> {
    const orderNumber = payload.requestReferenceNumber;

    switch (status) {
      case 'PAYMENT_SUCCESS':
        this.logger.log(`Payment successful for order ${orderNumber}`);
        await this.ordersService.updatePaymentStatus(orderId, 'paid', payload.id);
        await this.triggerComposition(orderId, orderNumber);
        break;

      case 'AUTHORIZED':
        this.logger.log(
          `Payment authorized for order ${orderNumber}, auto-capturing...`,
        );
        if (!isPaymentWebhook(payload)) {
          this.logger.warn(`Authorized status without payment payload for ${orderNumber}`);
          break;
        }
        await this.handleAuthorizedPayment(payload, orderId);
        break;

      case 'PAYMENT_FAILED':
      case 'AUTH_FAILED':
      case 'PAYMENT_CANCELLED':
        this.logger.log(`Payment failed for order ${orderNumber}: ${status}`);
        await this.ordersService.updatePaymentStatus(orderId, 'failed');
        break;

      case 'PAYMENT_EXPIRED':
        this.logger.log(`Payment expired for order ${orderNumber}`);
        await this.ordersService.updatePaymentStatus(orderId, 'failed');
        break;

      case 'VOIDED':
      case 'REFUNDED':
        this.logger.log(`Payment voided/refunded for order ${orderNumber}`);
        await this.ordersService.updatePaymentStatus(orderId, 'refunded');
        break;

      case 'PENDING_TOKEN':
      case 'PENDING_PAYMENT':
      case 'FOR_AUTHENTICATION':
      case 'AUTHENTICATING':
      case 'AUTH_SUCCESS':
      case 'PAYMENT_PROCESSING':
        this.logger.debug(`Intermediate status ${status} for order ${orderNumber}`);
        break;

      default:
        this.logger.warn(`Unknown payment status ${status} for order ${orderNumber}`);
    }
  }

  /**
   * Handle authorized payment - auto-capture
   */
  private async handleAuthorizedPayment(
    payload: MayaPaymentWebhookPayload,
    orderId: string,
  ): Promise<void> {
    const orderNumber = payload.requestReferenceNumber;

    if (!payload.canCapture) {
      this.logger.warn(`Payment ${payload.id} cannot be captured`);
      return;
    }

    try {
      const captureResult = await this.mayaService.capturePayment(payload.id);
      this.logger.log(`Payment captured: ${captureResult.id}`);

      await this.ordersService.updatePaymentStatus(orderId, 'paid', payload.id);
      await this.triggerComposition(orderId, orderNumber);
    } catch (error) {
      this.logger.error(
        `Failed to capture payment ${payload.id}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Trigger image composition after successful payment
   */
  private async triggerComposition(
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
    try {
      await this.ordersService.composeAndStoreImage(orderId);
      this.logger.log(`Composed image stored for order ${orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to compose image for order ${orderNumber}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get webhook history for an order (for debugging/admin)
   */
  async getWebhookHistory(orderNumber: string): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findByOrderNumber(orderNumber);
  }

  /**
   * Get webhook event by Maya payment ID
   */
  async getByMayaPaymentId(mayaPaymentId: string): Promise<WebhookEvent | null> {
    return this.webhookEventsRepository.findByMayaPaymentId(mayaPaymentId);
  }

  /**
   * Get unprocessed webhooks (for retry mechanism)
   */
  async getUnprocessedWebhooks(limit?: number): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findUnprocessed(limit);
  }
}

import { config } from '../../config/env';
import type { OrdersService } from '../orders/orders.service';
import type { MayaService } from '../payments/maya.service';
import type { IWebhookEventsRepository } from './domain/webhook-events.repository.interface';
import {
  type MayaWebhookPayload,
  type MayaPaymentWebhookPayload,
  type MayaPaymentStatus,
  isPaymentWebhook,
  isCheckoutWebhook,
  extractPaymentStatus,
  extractFundSourceType,
} from './domain/entities/maya-webhook.types';
import type { WebhookEvent } from './domain/entities/webhook-event.entity';
import type { Order } from '../orders/domain/entities/order.entity';
import { AppLogger } from '../../lib/logger';

export interface ProcessWebhookResult {
  received: boolean;
  message?: string;
  error?: string;
}

export interface PaymentVerificationResult {
  verified: boolean;
  amountMatch: boolean;
  statusMatch: boolean;
  verifiedAmount?: number;
  verifiedStatus?: MayaPaymentStatus;
  error?: string;
}

export class WebhookEventsService {
  private readonly logger = new AppLogger('WebhookEventsService');
  private readonly verificationEnabled: boolean;
  private readonly verificationMaxAttempts: number;

  constructor(
    private readonly webhookEventsRepository: IWebhookEventsRepository,
    private readonly ordersService: OrdersService,
    private readonly mayaService: MayaService,
  ) {
    this.verificationEnabled = config.maya.verificationEnabled;
    this.verificationMaxAttempts = config.maya.verificationMaxAttempts;
  }

  async processMayaWebhook(
    payload: MayaWebhookPayload,
  ): Promise<ProcessWebhookResult> {
    const orderNumber = payload.requestReferenceNumber;
    const paymentStatus = extractPaymentStatus(payload);
    const fundSourceType = extractFundSourceType(payload);
    const eventType = isCheckoutWebhook(payload) ? 'maya.checkout' : 'maya.payment';

    const webhookEvent = await this.webhookEventsRepository.create({
      eventType,
      mayaPaymentId: payload.id,
      orderNumber,
      paymentStatus,
      fundSourceType,
      rawPayload: payload as unknown as Record<string, unknown>,
    });

    try {
      const order = await this.ordersService.findByOrderNumber(orderNumber);

      if (!order) {
        await this.webhookEventsRepository.markVerificationSkipped(
          webhookEvent.id,
          'Order not found',
        );
        await this.webhookEventsRepository.markProcessed(
          webhookEvent.id,
          'Order not found',
        );
        return { received: true, message: 'Order not found' };
      }

      if (
        (paymentStatus === 'PAYMENT_SUCCESS' || paymentStatus === 'AUTHORIZED') &&
        order.paymentStatus === 'paid'
      ) {
        await this.webhookEventsRepository.markVerificationSkipped(
          webhookEvent.id,
          'Duplicate - already paid',
        );
        await this.webhookEventsRepository.markProcessed(
          webhookEvent.id,
          'Duplicate - already paid',
        );
        return { received: true, message: 'Already processed' };
      }

      if (
        this.verificationEnabled &&
        (paymentStatus === 'PAYMENT_SUCCESS' || paymentStatus === 'AUTHORIZED')
      ) {
        const verificationResult = await this.verifyPaymentWithMaya(
          webhookEvent.id,
          order,
          payload,
        );

        if (!verificationResult.verified) {
          const errorMsg =
            verificationResult.error ||
            'Payment verification failed: amount or status mismatch';

          await this.webhookEventsRepository.markProcessed(
            webhookEvent.id,
            `Verification failed: ${errorMsg}`,
          );

          return {
            received: true,
            message: 'Payment verification failed',
          };
        }
      } else if (!this.verificationEnabled) {
        await this.webhookEventsRepository.markVerificationSkipped(
          webhookEvent.id,
          'Verification disabled',
        );
      } else {
        await this.webhookEventsRepository.markVerificationSkipped(
          webhookEvent.id,
          `Non-success status: ${paymentStatus}`,
        );
      }

      await this.handlePaymentStatus(payload, order.id, paymentStatus);

      await this.webhookEventsRepository.markProcessed(webhookEvent.id);

      return { received: true };
    } catch (error) {
      const errorMessage = (error as Error).message;
      await this.webhookEventsRepository.markProcessed(webhookEvent.id, errorMessage);
      return { received: true, error: errorMessage };
    }
  }

  private async handlePaymentStatus(
    payload: MayaWebhookPayload,
    orderId: string,
    status: MayaPaymentStatus,
  ): Promise<void> {
    const orderNumber = payload.requestReferenceNumber;

    switch (status) {
      case 'PAYMENT_SUCCESS':
        await this.ordersService.updatePaymentStatus(orderId, 'paid', payload.id);
        await this.triggerComposition(orderId, orderNumber);
        break;
      case 'AUTHORIZED':
        if (!isPaymentWebhook(payload)) {
          break;
        }
        await this.handleAuthorizedPayment(payload, orderId);
        break;
      case 'PAYMENT_FAILED':
      case 'AUTH_FAILED':
      case 'PAYMENT_CANCELLED':
        await this.ordersService.updatePaymentStatus(orderId, 'failed');
        break;
      case 'PAYMENT_EXPIRED':
        await this.ordersService.updatePaymentStatus(orderId, 'failed');
        break;
      case 'VOIDED':
      case 'REFUNDED':
        await this.ordersService.updatePaymentStatus(orderId, 'refunded');
        break;
      case 'PENDING_TOKEN':
      case 'PENDING_PAYMENT':
      case 'FOR_AUTHENTICATION':
      case 'AUTHENTICATING':
      case 'AUTH_SUCCESS':
      case 'PAYMENT_PROCESSING':
        break;
      default:
        break;
    }
  }

  private async handleAuthorizedPayment(
    payload: MayaPaymentWebhookPayload,
    orderId: string,
  ): Promise<void> {
    if (!payload.canCapture) {
      return;
    }

    const captureResult = await this.mayaService.capturePayment(payload.id);

    await this.ordersService.updatePaymentStatus(orderId, 'paid', payload.id);
    await this.triggerComposition(orderId, payload.requestReferenceNumber);

    if (!captureResult) {
      throw new Error('Capture failed');
    }
  }

  private async triggerComposition(
    orderId: string,
    orderNumber: string,
  ): Promise<void> {
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

  async getByMayaPaymentId(mayaPaymentId: string): Promise<WebhookEvent | null> {
    return this.webhookEventsRepository.findByMayaPaymentId(mayaPaymentId);
  }

  async getUnprocessedWebhooks(limit?: number): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findUnprocessed(limit);
  }

  async getPendingVerificationWebhooks(limit?: number): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findPendingVerification(
      limit,
      this.verificationMaxAttempts,
    );
  }

  async verifyPaymentWithMaya(
    webhookEventId: string,
    order: Order,
    webhookPayload: MayaWebhookPayload,
  ): Promise<PaymentVerificationResult> {
    const webhookStatus = extractPaymentStatus(webhookPayload);

    await this.webhookEventsRepository.incrementVerificationAttempts(webhookEventId);

    if (!order.mayaCheckoutId) {
      const error = 'Order missing Maya checkout ID';
      await this.webhookEventsRepository.markVerificationFailed(
        webhookEventId,
        error,
      );
      return { verified: false, amountMatch: false, statusMatch: false, error };
    }

    try {
      const mayaCheckout = await this.mayaService.getCheckout(order.mayaCheckoutId);

      if (!mayaCheckout) {
        const error = 'Maya API returned null for checkout';
        return { verified: false, amountMatch: false, statusMatch: false, error };
      }

      const verifiedStatus = mayaCheckout.paymentStatus || (mayaCheckout as any).status;

      let verifiedAmountPhp: number;
      const totalAmt = mayaCheckout.totalAmount as any;

      if (totalAmt?.amount !== undefined) {
        verifiedAmountPhp = Number(totalAmt.amount);
      } else if (totalAmt?.value !== undefined) {
        verifiedAmountPhp = Number(totalAmt.value);
      } else if ((mayaCheckout as any).amount !== undefined) {
        verifiedAmountPhp = Number((mayaCheckout as any).amount);
      } else {
        verifiedAmountPhp = 0;
      }

      const verifiedAmountCentavos = Math.round(verifiedAmountPhp * 100);

      const successStatuses: MayaPaymentStatus[] = [
        'PAYMENT_SUCCESS',
        'AUTHORIZED',
      ];
      const isWebhookSuccess = successStatuses.includes(webhookStatus);
      const isApiSuccess = successStatuses.includes(verifiedStatus);

      const statusMatch =
        verifiedStatus === webhookStatus || (isWebhookSuccess && isApiSuccess);
      const amountDifference = Math.abs(
        verifiedAmountCentavos - order.totalAmount,
      );
      const amountMatch = amountDifference <= 1;

      const verified = statusMatch && amountMatch;

      if (verified) {
        await this.webhookEventsRepository.markVerified(
          webhookEventId,
          verifiedAmountCentavos,
          verifiedStatus,
        );
      } else {
        const error = !statusMatch
          ? `Status mismatch: webhook=${webhookStatus}, api=${verifiedStatus}`
          : `Amount mismatch: expected=${order.totalAmount}, got=${verifiedAmountCentavos}`;

        await this.webhookEventsRepository.markVerificationFailed(
          webhookEventId,
          error,
        );
      }

      return {
        verified,
        amountMatch,
        statusMatch,
        verifiedAmount: verifiedAmountCentavos,
        verifiedStatus,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      return {
        verified: false,
        amountMatch: false,
        statusMatch: false,
        error: `Maya API error: ${errorMessage}`,
      };
    }
  }

  async retryProcessWebhook(webhook: WebhookEvent, order: Order): Promise<boolean> {
    let payload: MayaWebhookPayload;
    if (typeof webhook.rawPayload === 'string') {
      payload = JSON.parse(webhook.rawPayload) as MayaWebhookPayload;
    } else {
      payload = webhook.rawPayload as unknown as MayaWebhookPayload;
    }
    const paymentStatus = extractPaymentStatus(payload);

    try {
      await this.handlePaymentStatus(payload, order.id, paymentStatus);
      await this.webhookEventsRepository.markProcessed(webhook.id);
      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;
      await this.webhookEventsRepository.markProcessed(webhook.id, errorMessage);
      return false;
    }
  }
}

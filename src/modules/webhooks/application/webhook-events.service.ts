import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import type { Order } from '../../orders/domain/entities/order.entity';

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

@Injectable()
export class WebhookEventsService {
  private readonly logger = new Logger(WebhookEventsService.name);
  private readonly verificationEnabled: boolean;
  private readonly verificationMaxAttempts: number;

  constructor(
    @Inject(IWebhookEventsRepositoryToken)
    private readonly webhookEventsRepository: IWebhookEventsRepository,
    private readonly ordersService: OrdersService,
    private readonly mayaService: MayaService,
    private readonly configService: ConfigService,
  ) {
    this.verificationEnabled =
      this.configService.get<boolean>('maya.verificationEnabled') ?? true;
    this.verificationMaxAttempts =
      this.configService.get<number>('maya.verificationMaxAttempts') ?? 5;
  }

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

    // 1. Store raw webhook event for audit (verification_status = 'pending')
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

      // 3. Check for duplicate processing (idempotency)
      if (
        (paymentStatus === 'PAYMENT_SUCCESS' || paymentStatus === 'AUTHORIZED') &&
        order.paymentStatus === 'paid'
      ) {
        this.logger.log(
          `Order ${orderNumber} already marked as paid, skipping duplicate webhook`,
        );
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

      // 4. SECURITY GATE: Verify with Maya API before processing success
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

          this.logger.error(
            `SECURITY: Rejecting webhook for ${orderNumber}: ${errorMsg}`,
          );

          await this.webhookEventsRepository.markProcessed(
            webhookEvent.id,
            `Verification failed: ${errorMsg}`,
          );

          // Return 200 OK to Maya (acknowledge receipt) but don't process payment
          return {
            received: true,
            message: 'Payment verification failed',
          };
        }

        this.logger.log(
          `Payment verification passed for ${orderNumber}, proceeding with status update`,
        );
      } else if (!this.verificationEnabled) {
        // Verification disabled - mark as skipped
        await this.webhookEventsRepository.markVerificationSkipped(
          webhookEvent.id,
          'Verification disabled',
        );
      } else {
        // Non-success status - skip verification
        await this.webhookEventsRepository.markVerificationSkipped(
          webhookEvent.id,
          `Non-success status: ${paymentStatus}`,
        );
      }

      // 5. Process based on payment status (only after verification for success)
      await this.handlePaymentStatus(payload, order.id, paymentStatus);

      // 6. Mark webhook as processed
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

  /**
   * Get webhooks pending verification (for retry job)
   */
  async getPendingVerificationWebhooks(limit?: number): Promise<WebhookEvent[]> {
    return this.webhookEventsRepository.findPendingVerification(
      limit,
      this.verificationMaxAttempts,
    );
  }

  /**
   * Verify webhook payment data against Maya API
   * Returns verification result with details for logging
   */
  async verifyPaymentWithMaya(
    webhookEventId: string,
    order: Order,
    webhookPayload: MayaWebhookPayload,
  ): Promise<PaymentVerificationResult> {
    const webhookStatus = extractPaymentStatus(webhookPayload);

    this.logger.log(
      `Verifying payment for order ${order.orderNumber} with Maya API`,
    );

    // Increment attempts first (for retry tracking)
    await this.webhookEventsRepository.incrementVerificationAttempts(webhookEventId);

    // Check if order has Maya checkout ID
    if (!order.mayaCheckoutId) {
      const error = 'Order missing Maya checkout ID';
      this.logger.error(`${error} for order ${order.orderNumber}`);
      await this.webhookEventsRepository.markVerificationFailed(
        webhookEventId,
        error,
      );
      return { verified: false, amountMatch: false, statusMatch: false, error };
    }

    try {
      // Fetch checkout details from Maya API
      const mayaCheckout = await this.mayaService.getCheckout(order.mayaCheckoutId);

      if (!mayaCheckout) {
        const error = 'Maya API returned null for checkout';
        this.logger.error(
          `Failed to fetch checkout ${order.mayaCheckoutId} for order ${order.orderNumber}`,
        );
        // Don't mark as failed yet - could be transient, allow retry
        return { verified: false, amountMatch: false, statusMatch: false, error };
      }

      // Log raw Maya API response for debugging
      this.logger.debug(
        `Maya API raw response for ${order.orderNumber}: ${JSON.stringify(mayaCheckout)}`,
      );

      // Extract verified data from Maya API response
      // Maya API can return different formats:
      // - Checkout endpoint: { paymentStatus, totalAmount: { value } }
      // - Payment endpoint: { status, amount (string in PHP) }
      const verifiedStatus = mayaCheckout.paymentStatus || (mayaCheckout as any).status;

      // Handle both amount formats
      let verifiedAmountPhp: number;
      if (mayaCheckout.totalAmount?.value !== undefined) {
        verifiedAmountPhp = Number(mayaCheckout.totalAmount.value);
        this.logger.debug(`Using totalAmount.value: ${mayaCheckout.totalAmount.value}`);
      } else if ((mayaCheckout as any).amount !== undefined) {
        verifiedAmountPhp = Number((mayaCheckout as any).amount);
        this.logger.debug(`Using amount field: ${(mayaCheckout as any).amount}`);
      } else {
        this.logger.warn(
          `Could not extract amount from Maya API response for ${order.orderNumber}. ` +
            `Available keys: ${Object.keys(mayaCheckout).join(', ')}`,
        );
        verifiedAmountPhp = 0;
      }

      const verifiedAmountCentavos = Math.round(verifiedAmountPhp * 100);

      this.logger.debug(
        `Maya API verification for ${order.orderNumber}: ` +
          `status=${verifiedStatus}, amount=${verifiedAmountPhp} PHP (${verifiedAmountCentavos} centavos)`,
      );

      // Verify payment status matches (with equivalence for success statuses)
      // Maya may report AUTHORIZED or PAYMENT_SUCCESS interchangeably for successful payments
      const successStatuses: MayaPaymentStatus[] = ['PAYMENT_SUCCESS', 'AUTHORIZED'];
      const isWebhookSuccess = successStatuses.includes(webhookStatus);
      const isApiSuccess = successStatuses.includes(verifiedStatus);

      // Status matches if: exact match OR both indicate success
      const statusMatch = verifiedStatus === webhookStatus || (isWebhookSuccess && isApiSuccess);
      if (!statusMatch) {
        this.logger.warn(
          `Payment status mismatch for ${order.orderNumber}: ` +
            `webhook=${webhookStatus}, Maya API=${verifiedStatus}`,
        );
      }

      // Verify amount matches (allow 1 centavo tolerance for rounding)
      const amountDifference = Math.abs(verifiedAmountCentavos - order.totalAmount);
      const amountMatch = amountDifference <= 1;

      if (!amountMatch) {
        this.logger.error(
          `CRITICAL: Amount mismatch for ${order.orderNumber}: ` +
            `expected=${order.totalAmount} centavos, Maya API=${verifiedAmountCentavos} centavos ` +
            `(difference: ${amountDifference} centavos)`,
        );
      }

      // Mark as verified only if both status and amount match
      const verified = statusMatch && amountMatch;

      if (verified) {
        await this.webhookEventsRepository.markVerified(
          webhookEventId,
          verifiedAmountCentavos,
          verifiedStatus,
        );
        this.logger.log(`Payment verified for order ${order.orderNumber}`);
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
      this.logger.error(
        `Maya API verification error for ${order.orderNumber}: ${errorMessage}`,
      );

      // Don't mark as failed for API errors - allow retry
      return {
        verified: false,
        amountMatch: false,
        statusMatch: false,
        error: `Maya API error: ${errorMessage}`,
      };
    }
  }

  /**
   * Retry processing a pending verification webhook
   * Called by the retry job after verification succeeds
   */
  async retryProcessWebhook(webhook: WebhookEvent, order: Order): Promise<boolean> {
    const payload = webhook.rawPayload as unknown as MayaWebhookPayload;
    const paymentStatus = extractPaymentStatus(payload);

    this.logger.log(`Retrying webhook ${webhook.id} for order ${order.orderNumber}`);

    try {
      await this.handlePaymentStatus(payload, order.id, paymentStatus);
      await this.webhookEventsRepository.markProcessed(webhook.id);
      this.logger.log(`Retry successful for webhook ${webhook.id}`);
      return true;
    } catch (error) {
      const errorMessage = (error as Error).message;
      this.logger.error(`Retry failed for webhook ${webhook.id}: ${errorMessage}`);
      await this.webhookEventsRepository.markProcessed(webhook.id, errorMessage);
      return false;
    }
  }
}

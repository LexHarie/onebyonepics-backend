import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhookEventsService } from './webhook-events.service';
import { OrdersService } from '../../orders/application/orders.service';
import type { MayaWebhookPayload } from '../domain/entities/maya-webhook.types';

@Injectable()
export class WebhookVerificationRetryService {
  private readonly logger = new Logger(WebhookVerificationRetryService.name);
  private isRunning = false;

  constructor(
    private readonly webhookEventsService: WebhookEventsService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Retry verification for pending webhooks
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryPendingVerifications(): Promise<void> {
    // Prevent concurrent runs
    if (this.isRunning) {
      this.logger.debug('Retry job already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      this.logger.debug('Checking for pending webhook verifications...');

      const pendingWebhooks =
        await this.webhookEventsService.getPendingVerificationWebhooks(20);

      if (pendingWebhooks.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${pendingWebhooks.length} pending verifications, retrying...`,
      );

      let successCount = 0;
      let failCount = 0;

      for (const webhook of pendingWebhooks) {
        try {
          if (!webhook.orderNumber) {
            this.logger.warn(
              `Webhook ${webhook.id} missing order number, skipping`,
            );
            failCount++;
            continue;
          }

          const order = await this.ordersService.findByOrderNumber(
            webhook.orderNumber,
          );

          if (!order) {
            this.logger.warn(
              `Order ${webhook.orderNumber} not found for webhook ${webhook.id}`,
            );
            failCount++;
            continue;
          }

          // Skip if order is already paid (duplicate handling)
          if (order.paymentStatus === 'paid') {
            this.logger.debug(
              `Order ${webhook.orderNumber} already paid, skipping webhook ${webhook.id}`,
            );
            continue;
          }

          // Reconstruct payload from raw_payload (may be string if from older records)
          let payload: MayaWebhookPayload;
          if (typeof webhook.rawPayload === 'string') {
            payload = JSON.parse(webhook.rawPayload) as MayaWebhookPayload;
          } else {
            payload = webhook.rawPayload as unknown as MayaWebhookPayload;
          }

          // Retry verification
          const verificationResult =
            await this.webhookEventsService.verifyPaymentWithMaya(
              webhook.id,
              order,
              payload,
            );

          if (verificationResult.verified) {
            // Process the payment now that verification succeeded
            const success = await this.webhookEventsService.retryProcessWebhook(
              webhook,
              order,
            );

            if (success) {
              successCount++;
              this.logger.log(
                `Retry successful: verified and processed webhook ${webhook.id}`,
              );
            } else {
              failCount++;
            }
          } else {
            failCount++;
            this.logger.warn(
              `Retry verification failed for webhook ${webhook.id}: ${verificationResult.error}`,
            );
          }
        } catch (error) {
          failCount++;
          this.logger.error(
            `Error retrying webhook ${webhook.id}: ${(error as Error).message}`,
          );
        }
      }

      if (successCount > 0 || failCount > 0) {
        this.logger.log(
          `Verification retry complete: ${successCount} succeeded, ${failCount} failed`,
        );
      }
    } finally {
      this.isRunning = false;
    }
  }
}

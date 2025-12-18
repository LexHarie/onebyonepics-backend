import {
  Controller,
  Post,
  Headers,
  Req,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { MayaService, type MayaWebhookPayload } from '../../../payments/infrastructure/maya.service';
import { OrdersService } from '../../../orders/application/orders.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly mayaService: MayaService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Handle Maya payment webhooks
   * Maya sends webhooks for various payment events
   */
  @Post('maya')
  async handleMayaWebhook(
    @Req() req: FastifyRequest,
    @Headers('x-maya-signature') signature?: string,
  ) {
    const rawBody = JSON.stringify(req.body);

    this.logger.debug(`Received Maya webhook: ${rawBody.substring(0, 200)}...`);

    // Verify webhook signature in production
    if (process.env.NODE_ENV === 'production' && signature) {
      if (!this.mayaService.verifyWebhookSignature(rawBody, signature)) {
        this.logger.warn('Invalid Maya webhook signature');
        throw new ForbiddenException('Invalid webhook signature');
      }
    }

    const payload = req.body as MayaWebhookPayload;

    if (!payload || !payload.requestReferenceNumber) {
      throw new BadRequestException('Invalid webhook payload');
    }

    const orderNumber = payload.requestReferenceNumber;
    this.logger.log(`Maya webhook for order ${orderNumber}: status=${payload.status}, isPaid=${payload.isPaid}`);

    try {
      // Find order by order number
      const order = await this.ordersService.findByOrderNumber(orderNumber);

      if (!order) {
        this.logger.warn(`Order not found for webhook: ${orderNumber}`);
        // Return success to Maya anyway to prevent retries
        return { received: true, message: 'Order not found' };
      }

      // Handle payment status
      if (payload.isPaid && payload.status === 'PAYMENT_SUCCESS') {
        this.logger.log(`Payment successful for order ${orderNumber}`);

        // Update order to paid status
        await this.ordersService.updatePaymentStatus(
          order.id,
          'paid',
          payload.id,
        );

        // Compose and store the final 4R image
        try {
          await this.ordersService.composeAndStoreImage(order.id);
          this.logger.log(`Composed image stored for order ${orderNumber}`);
        } catch (composeError) {
          this.logger.error(`Failed to compose image for order ${orderNumber}: ${(composeError as Error).message}`);
          // Continue - order is paid, composition can be retried
        }

      } else if (payload.status === 'PAYMENT_FAILED' || payload.status === 'PAYMENT_EXPIRED') {
        this.logger.log(`Payment failed/expired for order ${orderNumber}: ${payload.status}`);

        await this.ordersService.updatePaymentStatus(order.id, 'failed');

      } else if (payload.status === 'VOIDED' || payload.status === 'REFUNDED') {
        this.logger.log(`Payment voided/refunded for order ${orderNumber}: ${payload.status}`);

        await this.ordersService.updatePaymentStatus(order.id, 'refunded');
      }

      return { received: true };
    } catch (error) {
      this.logger.error(`Error processing Maya webhook: ${(error as Error).message}`);
      // Return success anyway to prevent webhook retries
      return { received: true, error: (error as Error).message };
    }
  }

  /**
   * Health check endpoint for webhook testing
   */
  @Post('maya/test')
  async testMayaWebhook() {
    return {
      status: 'ok',
      message: 'Maya webhook endpoint is working',
      configured: this.mayaService.isConfigured(),
    };
  }
}

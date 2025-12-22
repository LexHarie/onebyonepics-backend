import {
  Controller,
  Post,
  Get,
  Headers,
  Req,
  Param,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { MayaService } from '../../../payments/infrastructure/maya.service';
import { WebhookEventsService } from '../../application/webhook-events.service';
import type { MayaWebhookPayload } from '../../domain/entities/maya-webhook.types';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly mayaService: MayaService,
    private readonly webhookEventsService: WebhookEventsService,
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
    if (process.env.NODE_ENV === 'production') {
      if (!signature) {
        this.logger.warn('Missing Maya webhook signature in production');
        throw new ForbiddenException('Missing webhook signature');
      }

      if (!this.mayaService.verifyWebhookSignature(rawBody, signature)) {
        this.logger.warn('Invalid Maya webhook signature');
        throw new ForbiddenException('Invalid webhook signature');
      }
    }

    const payload = req.body as MayaWebhookPayload;

    if (!payload || !payload.requestReferenceNumber) {
      throw new BadRequestException(
        'Invalid webhook payload: missing requestReferenceNumber',
      );
    }

    return this.webhookEventsService.processMayaWebhook(payload);
  }

  /**
   * Get webhook history for an order (for debugging/admin)
   */
  @Get('maya/history/:orderNumber')
  async getWebhookHistory(@Param('orderNumber') orderNumber: string) {
    this.logger.debug(`Getting webhook history for order ${orderNumber}`);
    return this.webhookEventsService.getWebhookHistory(orderNumber);
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

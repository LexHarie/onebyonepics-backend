import { Elysia } from 'elysia';
import { httpError } from '../../lib/http-error';
import { PayMongoService } from '../payments/paymongo.service';
import { ordersService } from '../orders';
import { WebhookEventsService } from './webhook-events.service';
import { createWebhookEventsRepository } from './webhook-events.repository';
import type { PayMongoWebhookPayload } from './domain/entities/paymongo-webhook.types';
import { webhooksSchema } from './webhooks.schema';

const paymongoService = new PayMongoService();
const webhookEventsService = new WebhookEventsService(
  createWebhookEventsRepository(),
  ordersService,
);

export const webhooksModule = new Elysia({ name: 'webhooks' })
  .post('/webhooks/paymongo', async ({ request }) => {
    const signature = request.headers.get('paymongo-signature');
    const rawBody = await request.text();

    if (
      process.env.NODE_ENV === 'production' &&
      paymongoService.isWebhookSignatureConfigured()
    ) {
      if (!signature) {
        throw httpError(403, 'Missing webhook signature');
      }

      if (!paymongoService.verifyWebhookSignature(rawBody, signature)) {
        throw httpError(403, 'Invalid webhook signature');
      }
    }

    const payload = JSON.parse(rawBody) as PayMongoWebhookPayload;

    if (!payload?.data?.attributes?.data?.attributes?.reference_number) {
      throw httpError(
        400,
        'Invalid webhook payload: missing reference_number',
      );
    }

    return webhookEventsService.processPayMongoWebhook(payload);
  })
  .get(
    '/webhooks/paymongo/history/:orderNumber',
    ({ params }) => webhookEventsService.getWebhookHistory(params.orderNumber),
    {
      params: webhooksSchema.params,
    },
  )
  .post('/webhooks/paymongo/test', () => ({
    status: 'ok',
    message: 'PayMongo webhook endpoint is working',
    configured: paymongoService.isConfigured(),
  }));

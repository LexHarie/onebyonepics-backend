import { Elysia } from 'elysia';
import { config } from '../../config/env';
import { httpError } from '../../lib/http-error';
import { MayaService } from '../payments/maya.service';
import { ordersService } from '../orders';
import { WebhookEventsService } from './webhook-events.service';
import { createWebhookEventsRepository } from './webhook-events.repository';
import type { MayaWebhookPayload } from './domain/entities/maya-webhook.types';
import { webhooksSchema } from './webhooks.schema';

const normalizeIp = (ip: string | null) => {
  if (!ip) return null;
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }
  return ip;
};

const getClientIp = (request: Request): string | null => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return normalizeIp(forwardedFor.split(',')[0]?.trim() ?? null);
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return normalizeIp(realIp.trim());
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return normalizeIp(cfIp.trim());
  }

  return null;
};

const mayaService = new MayaService();
const webhookEventsService = new WebhookEventsService(
  createWebhookEventsRepository(),
  ordersService,
  mayaService,
);

export const webhooksModule = new Elysia({ name: 'webhooks' })
  .post('/webhooks/maya', async ({ request }) => {
    if (process.env.NODE_ENV === 'production') {
      const clientIp = getClientIp(request);
      const allowedIps = config.maya.webhookAllowedIps || [];
      if (!clientIp || !allowedIps.includes(clientIp)) {
        throw httpError(403, 'Forbidden');
      }
    }

    const signature = request.headers.get('x-maya-signature');
    const rawBody = await request.text();

    if (
      process.env.NODE_ENV === 'production' &&
      mayaService.isWebhookSignatureConfigured()
    ) {
      if (!signature) {
        throw httpError(403, 'Missing webhook signature');
      }

      if (!mayaService.verifyWebhookSignature(rawBody, signature)) {
        throw httpError(403, 'Invalid webhook signature');
      }
    }

    const payload = JSON.parse(rawBody) as MayaWebhookPayload;

    if (!payload || !payload.requestReferenceNumber) {
      throw httpError(
        400,
        'Invalid webhook payload: missing requestReferenceNumber',
      );
    }

    return webhookEventsService.processMayaWebhook(payload);
  })
  .get(
    '/webhooks/maya/history/:orderNumber',
    ({ params }) => webhookEventsService.getWebhookHistory(params.orderNumber),
    {
      params: webhooksSchema.params,
    },
  )
  .post('/webhooks/maya/test', () => ({
    status: 'ok',
    message: 'Maya webhook endpoint is working',
    configured: mayaService.isConfigured(),
  }));

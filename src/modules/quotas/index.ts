import { Elysia } from 'elysia';
import { createQuotasRepository } from './quotas.repository';
import { QuotasService } from './quotas.service';
import { quotasSchema } from './quotas.schema';
import { httpError } from '../../lib/http-error';

export const quotasPlugin = new Elysia({ name: 'quotas' })
  .decorate('quotas', new QuotasService(createQuotasRepository()))
  .get(
    '/session/quota',
    async ({ query, quotas }) => {
      if (!query.sessionId) {
        throw httpError(400, 'Session ID is required');
      }

      const quota = await quotas.getQuota(query.sessionId);
      return {
        used: quota.previewCount,
        max: quota.maxPreviews,
        remaining: quota.remaining,
      };
    },
    {
      query: quotasSchema.query,
    },
  );

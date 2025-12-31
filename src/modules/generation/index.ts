import { Elysia } from 'elysia';
import { getAuthSession } from '../../lib/auth-session';
import { createGenerationRepository } from './generation.repository';
import { GenerationService } from './generation.service';
import { generationSchema } from './generation.schema';
import { StorageService } from '../storage/storage.service';
import { ImagesService } from '../images/images.service';
import { createImagesRepository } from '../images/images.repository';
import { QuotasService } from '../quotas/quotas.service';
import { createQuotasRepository } from '../quotas/quotas.repository';
import { GenAIService } from '../genai/genai.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { WatermarkService } from '../watermark/watermark.service';
import { authContextPlugin } from '../../plugins/auth.plugin';

const storageService = new StorageService();
const imagesService = new ImagesService(createImagesRepository(), storageService);
const quotasService = new QuotasService(createQuotasRepository());
const genAIService = new GenAIService(new RateLimiterService());
const watermarkService = new WatermarkService();
export const generationService = new GenerationService(
  createGenerationRepository(),
  imagesService,
  storageService,
  genAIService,
  quotasService,
  watermarkService,
);

export const generationModule = new Elysia({ name: 'generation' })
  .use(authContextPlugin)
  .decorate('generation', generationService)
  .post(
    '/generation/create',
    async ({ body, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;

      return generationService.createJob({
        user: user ?? undefined,
        sessionId: body.sessionId,
        uploadedImageId: body.uploadedImageId,
        gridConfigId: body.gridConfigId,
        variationCount: body.variationCount ?? 1,
      });
    },
    {
      body: generationSchema.create,
    },
  )
  .get(
    '/generation/history',
    async ({ query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      return generationService.getHistory(user ?? undefined, query.sessionId);
    },
    {
      query: generationSchema.query,
    },
  )
  .get(
    '/generation/:jobId/status',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      return generationService.getStatus(
        params.jobId,
        user ?? undefined,
        query.sessionId,
      );
    },
    {
      params: generationSchema.params,
      query: generationSchema.query,
    },
  )
  .get(
    '/generation/:jobId/result',
    async ({ params, query, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user ?? null;
      const includeData = query.includeData === 'true';
      return generationService.getResult(
        params.jobId,
        user ?? undefined,
        query.sessionId,
        includeData,
      );
    },
    {
      params: generationSchema.params,
      query: generationSchema.query,
    },
  );

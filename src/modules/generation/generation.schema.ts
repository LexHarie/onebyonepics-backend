import { t } from 'elysia';

export const generationSchema = {
  create: t.Object({
    uploadedImageId: t.String(),
    gridConfigId: t.String(),
    variationCount: t.Optional(t.Number({ minimum: 1, maximum: 4 })),
    sessionId: t.Optional(t.String()),
  }),
  params: t.Object({
    jobId: t.String(),
  }),
  query: t.Object({
    sessionId: t.Optional(t.String()),
    includeData: t.Optional(t.String()),
  }),
};

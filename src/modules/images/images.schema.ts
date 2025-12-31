import { t } from 'elysia';

export const imagesSchema = {
  upload: t.Object({
    file: t.File(),
    sessionId: t.Optional(t.String()),
  }),
  params: t.Object({
    id: t.String(),
  }),
  query: t.Object({
    sessionId: t.Optional(t.String()),
  }),
};

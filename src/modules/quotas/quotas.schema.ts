import { t } from 'elysia';

export const quotasSchema = {
  query: t.Object({
    sessionId: t.String(),
  }),
};

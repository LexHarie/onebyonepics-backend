import { t } from 'elysia';

export const sessionMigrationSchema = {
  body: t.Object({
    sessionId: t.String(),
  }),
};

import { t } from 'elysia';

export const webhooksSchema = {
  params: t.Object({
    orderNumber: t.String(),
  }),
};

import { t } from 'elysia';

export const gridConfigsSchema = {
  params: t.Object({
    id: t.String(),
  }),
};

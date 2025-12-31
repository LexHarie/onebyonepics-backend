import { Elysia } from 'elysia';
import { GridConfigsService } from './grid-configs.service';
import { gridConfigsSchema } from './grid-configs.schema';

const service = new GridConfigsService();

export const gridConfigsModule = new Elysia({ name: 'grid-configs' })
  .get('/grid-configs', () => service.findAll())
  .get(
    '/grid-configs/:id',
    ({ params, set }) => {
      const config = service.findById(params.id);
      if (!config) {
        set.status = 404;
        return { message: 'Grid configuration not found' };
      }
      return config;
    },
    {
      params: gridConfigsSchema.params,
    },
  );

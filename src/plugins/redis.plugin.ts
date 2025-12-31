import { Elysia } from 'elysia';
import { closeRedis, getRedis, initRedis } from '../lib/redis';

export const redisPlugin = new Elysia({ name: 'redis' })
  .onStart(async () => {
    await initRedis();
  })
  .derive(() => ({
    redis: getRedis(),
  }))
  .onStop(() => {
    closeRedis();
  });

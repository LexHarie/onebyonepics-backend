import { Elysia } from 'elysia';
import { RateLimiterService } from './rate-limiter.service';

export const rateLimiterPlugin = new Elysia({ name: 'rate-limiter' }).decorate(
  'rateLimiter',
  new RateLimiterService(),
);

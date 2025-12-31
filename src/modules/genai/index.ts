import { Elysia } from 'elysia';
import { GenAIService } from './genai.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';

export const genaiPlugin = new Elysia({ name: 'genai' }).decorate(
  'genai',
  new GenAIService(new RateLimiterService()),
);

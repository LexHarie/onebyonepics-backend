import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RateLimiterService } from './application/rate-limiter.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [ConfigModule, RedisModule],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}

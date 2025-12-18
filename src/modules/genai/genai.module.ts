import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenAIService } from './infrastructure/genai.service';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';

@Module({
  imports: [ConfigModule, RateLimiterModule],
  providers: [GenAIService],
  exports: [GenAIService],
})
export class GenAIModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenAIService } from './genai.service';
import { RateLimiterModule } from '../rate-limiter';

@Module({
  imports: [ConfigModule, RateLimiterModule],
  providers: [GenAIService],
  exports: [GenAIService],
})
export class GenAIModule {}

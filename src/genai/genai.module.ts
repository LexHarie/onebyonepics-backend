import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GenAIService } from './genai.service';

@Module({
  imports: [ConfigModule],
  providers: [GenAIService],
  exports: [GenAIService],
})
export class GenAIModule {}

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';

export const GENERATION_QUEUE = 'generation';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        connection: redisService.client,
        defaultJobOptions: {
          removeOnComplete: 100, // Keep last 100 completed jobs
          removeOnFail: 50, // Keep last 50 failed jobs
        },
      }),
    }),
    BullModule.registerQueue({
      name: GENERATION_QUEUE,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}

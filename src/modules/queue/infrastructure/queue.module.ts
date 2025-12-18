import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const GENERATION_QUEUE = 'generation';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('redis.url'),
        },
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

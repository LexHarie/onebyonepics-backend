import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

function buildRedisConnection(redisUrl: string) {
  try {
    const url = new URL(redisUrl);
    const port = url.port ? Number(url.port) : 6379;
    const db = url.pathname ? Number(url.pathname.replace('/', '')) : undefined;
    const password = url.password ? decodeURIComponent(url.password) : undefined;
    const username = url.username ? decodeURIComponent(url.username) : undefined;
    const useTls = url.protocol === 'rediss:';

    return {
      host: url.hostname,
      port: Number.isNaN(port) ? 6379 : port,
      db: Number.isNaN(db) ? undefined : db,
      password,
      username,
      tls: useTls ? {} : undefined,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
    };
  }
}

export const GENERATION_QUEUE = 'generation';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get<string>('redis.url') || 'redis://localhost:6379';
        return {
          connection: buildRedisConnection(redisUrl),
          defaultJobOptions: {
            removeOnComplete: 100, // Keep last 100 completed jobs
            removeOnFail: 50, // Keep last 50 failed jobs
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: GENERATION_QUEUE,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}

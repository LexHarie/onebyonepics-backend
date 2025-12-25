import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { GENERATION_QUEUE } from '../../queue/queue.module';
import type { GenerationJobData } from '../infrastructure/workers/generation.processor';
import {
  IGenerationRepositoryToken,
  type IGenerationRepository,
} from '../domain/generation.repository.interface';
import type { GenerationJobStatus } from '../domain/entities/generation-job.entity';

const RECOVERY_STATUSES: GenerationJobStatus[] = ['pending', 'processing'];
const RECOVERY_LOOKBACK_HOURS = 24;

@Injectable()
export class GenerationQueueRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GenerationQueueRecoveryService.name);

  constructor(
    @InjectQueue(GENERATION_QUEUE)
    private readonly generationQueue: Queue<GenerationJobData>,
    @Inject(IGenerationRepositoryToken)
    private readonly generationRepository: IGenerationRepository,
  ) {}

  async onApplicationBootstrap() {
    await this.recoverQueue();
  }

  private async recoverQueue() {
    try {
      const isPaused = await this.generationQueue.isPaused();
      if (isPaused) {
        await this.generationQueue.resume();
        this.logger.warn('Generation queue was paused; resumed on startup.');
      }

      const createdAfter = new Date(
        Date.now() - RECOVERY_LOOKBACK_HOURS * 60 * 60 * 1000,
      );
      const jobs = await this.generationRepository.findJobsForRecovery({
        statuses: RECOVERY_STATUSES,
        createdAfter,
      });

      if (jobs.length === 0) {
        return;
      }

      const queueJobs = await this.generationQueue.getJobs(
        ['waiting', 'delayed', 'active', 'paused', 'prioritized'],
      );
      const queuedJobIds = new Set(
        queueJobs
          .map((job) => job.data?.jobId)
          .filter((jobId): jobId is string => typeof jobId === 'string'),
      );

      let requeued = 0;
      for (const job of jobs) {
        if (queuedJobIds.has(job.id)) continue;

        const existing = await this.generationQueue.getJob(job.id);
        if (existing) continue;

        try {
          await this.generationQueue.add(
            'generate',
            { jobId: job.id },
            {
              jobId: job.id,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            },
          );
          requeued++;
        } catch (error) {
          this.logger.warn(
            `Failed to re-queue generation job ${job.id}: ${(error as Error).message}`,
          );
        }
      }

      if (requeued > 0) {
        this.logger.warn(
          `Re-queued ${requeued} generation job(s) after restart.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to recover generation queue: ${(error as Error).message}`,
      );
    }
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  rowToGenerationJob,
  type GenerationJobStatus,
} from '../../generation/domain/entities/generation-job.entity';
import { rowToGeneratedImage } from '../../generation/domain/entities/generated-image.entity';
import { rowToUploadedImage } from '../../images/domain/entities/image.entity';
import { GENERATION_QUEUE } from '../../queue/queue.module';
import type { GenerationJobData } from '../../generation/infrastructure/workers/generation.processor';
import { AdminRepository } from '../infrastructure/repositories/admin.repository';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminGenerationService {
  constructor(
    private readonly adminRepository: AdminRepository,
    @InjectQueue(GENERATION_QUEUE) private readonly generationQueue: Queue<GenerationJobData>,
  ) {}

  private normalizePagination(page?: number, pageSize?: number) {
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const offset = (safePage - 1) * safePageSize;
    return { page: safePage, pageSize: safePageSize, offset };
  }

  async listJobs(params: {
    status?: GenerationJobStatus;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const { page, pageSize, offset } = this.normalizePagination(
      params.page,
      params.pageSize,
    );

    const { rows, total } = await this.adminRepository.listGenerationJobs({
      status: params.status ?? null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      limit: pageSize,
      offset,
    });

    return {
      items: rows.map(rowToGenerationJob),
      total,
      page,
      pageSize,
    };
  }

  async getJob(jobId: string) {
    const row = await this.adminRepository.findGenerationJobById(jobId);
    if (!row) {
      throw new NotFoundException('Job not found');
    }

    const job = rowToGenerationJob(row);
    const uploaded = job.uploadedImageId
      ? await this.adminRepository.findUploadedImageById(job.uploadedImageId)
      : null;
    const generatedRows = await this.adminRepository.findGeneratedImagesByJobId(jobId);

    return {
      job,
      uploadedImage: uploaded ? rowToUploadedImage(uploaded) : null,
      generatedImages: generatedRows.map(rowToGeneratedImage),
    };
  }

  async listFailedJobs(params: { page?: number; pageSize?: number }) {
    const { page, pageSize, offset } = this.normalizePagination(
      params.page,
      params.pageSize,
    );

    const { rows, total } = await this.adminRepository.listFailedJobs({
      limit: pageSize,
      offset,
    });

    return {
      items: rows.map(rowToGenerationJob),
      total,
      page,
      pageSize,
    };
  }

  async retryJob(jobId: string, adminUserId: string, ipAddress: string | null) {
    const row = await this.adminRepository.findGenerationJobById(jobId);
    if (!row) {
      throw new NotFoundException('Job not found');
    }

    await this.adminRepository.resetGenerationJob(jobId);

    await this.generationQueue.add(
      'generate',
      { jobId },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: 'generation.retry',
      targetType: 'generation_job',
      targetId: jobId,
      metadata: {
        previousStatus: row.status,
      },
      ipAddress,
    });

    return { queued: true };
  }
}

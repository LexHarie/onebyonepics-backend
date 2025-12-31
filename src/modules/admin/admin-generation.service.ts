import {
  rowToGenerationJob,
  type GenerationJobStatus,
} from '../generation/domain/entities/generation-job.entity';
import { rowToGeneratedImage } from '../generation/domain/entities/generated-image.entity';
import { rowToUploadedImage } from '../images/domain/entities/image.entity';
import { httpError } from '../../lib/http-error';
import type { AdminRepository } from './admin.repository';
import type { GenerationService } from '../generation/generation.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export class AdminGenerationService {
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly generationService: GenerationService,
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
      throw httpError(404, 'Job not found');
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
      throw httpError(404, 'Job not found');
    }

    await this.adminRepository.resetGenerationJob(jobId);
    await this.generationService.runJob(jobId);

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

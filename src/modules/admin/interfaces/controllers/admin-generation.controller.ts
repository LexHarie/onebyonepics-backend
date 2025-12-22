import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, CurrentUser, type User } from '@buiducnhat/nest-better-auth';
import type { FastifyRequest } from 'fastify';
import { AdminGenerationService } from '../../application/admin-generation.service';
import type { GenerationJobStatus } from '../../../generation/domain/entities/generation-job.entity';
import { AdminGuard } from '../guards/admin.guard';
import { GenerationJobsQueryDto } from '../dto/generation-jobs-query.dto';

@Controller('admin/generation')
@UseGuards(AuthGuard, AdminGuard)
export class AdminGenerationController {
  constructor(private readonly adminGenerationService: AdminGenerationService) {}

  @Get('jobs')
  async listJobs(@Query() query: GenerationJobsQueryDto) {
    return this.adminGenerationService.listJobs({
      status: query.status as GenerationJobStatus | undefined,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    return this.adminGenerationService.getJob(id);
  }

  @Get('failed')
  async listFailed(@Query() query: GenerationJobsQueryDto) {
    return this.adminGenerationService.listFailedJobs({
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post('jobs/:id/retry')
  async retryJob(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Req() req: FastifyRequest,
  ) {
    return this.adminGenerationService.retryJob(id, user.id, req.ip || null);
  }
}

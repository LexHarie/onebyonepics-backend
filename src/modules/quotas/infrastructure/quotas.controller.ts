import {
  Controller,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { QuotasService } from '../application/quotas.service';

@Controller('session')
export class QuotasController {
  constructor(private readonly quotasService: QuotasService) {}

  /**
   * Get quota for a session
   */
  @Get('quota')
  async getQuota(@Query('sessionId') sessionId?: string) {
    if (!sessionId) {
      throw new BadRequestException('Session ID is required');
    }

    const quota = await this.quotasService.getQuota(sessionId);

    return {
      used: quota.previewCount,
      max: quota.maxPreviews,
      remaining: quota.remaining,
    };
  }
}

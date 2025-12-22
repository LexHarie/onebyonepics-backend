import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@buiducnhat/nest-better-auth';
import { AdminSystemService } from '../../application/admin-system.service';
import { AdminGuard } from '../guards/admin.guard';
import { AuditLogsQueryDto } from '../dto/audit-logs-query.dto';
import { WebhooksQueryDto } from '../dto/webhooks-query.dto';

@Controller('admin/system')
@UseGuards(AuthGuard, AdminGuard)
export class AdminSystemController {
  constructor(private readonly adminSystemService: AdminSystemService) {}

  @Get('health')
  async getHealth() {
    return this.adminSystemService.getHealth();
  }

  @Get('webhooks')
  async getWebhooks(@Query() query: WebhooksQueryDto) {
    return this.adminSystemService.getWebhooks(query.limit);
  }

  @Get('storage')
  async getStorage() {
    return this.adminSystemService.getStorageStats();
  }

  @Get('audit-logs')
  async getAuditLogs(@Query() query: AuditLogsQueryDto) {
    return this.adminSystemService.getAuditLogs({
      page: query.page,
      pageSize: query.pageSize,
    });
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@buiducnhat/nest-better-auth';
import { AdminDashboardService } from '../../application/admin-dashboard.service';
import { AdminGuard } from '../guards/admin.guard';

@Controller('admin/dashboard')
@UseGuards(AuthGuard, AdminGuard)
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get()
  async getOverview() {
    return this.adminDashboardService.getOverview();
  }

  @Get('stats')
  async getStats() {
    return this.adminDashboardService.getStats();
  }
}

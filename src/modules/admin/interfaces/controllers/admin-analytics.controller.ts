import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@buiducnhat/nest-better-auth';
import { AdminAnalyticsService } from '../../application/admin-analytics.service';
import { AdminGuard } from '../guards/admin.guard';
import { AnalyticsRevenueQueryDto } from '../dto/analytics-revenue-query.dto';

@Controller('admin/analytics')
@UseGuards(AuthGuard, AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('revenue')
  async getRevenue(@Query() query: AnalyticsRevenueQueryDto) {
    return this.adminAnalyticsService.getRevenueSeries(query.period, query.range);
  }

  @Get('orders')
  async getOrders() {
    return this.adminAnalyticsService.getOrderStats();
  }

  @Get('generation')
  async getGeneration() {
    return this.adminAnalyticsService.getGenerationStats();
  }

  @Get('funnel')
  async getFunnel() {
    return this.adminAnalyticsService.getFunnelStats();
  }
}

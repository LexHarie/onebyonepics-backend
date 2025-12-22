import { Injectable } from '@nestjs/common';
import { AdminRepository } from '../infrastructure/repositories/admin.repository';

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly adminRepository: AdminRepository) {}

  private normalizePeriod(period?: string): 'day' | 'week' | 'month' {
    if (period === 'weekly' || period === 'week') return 'week';
    if (period === 'monthly' || period === 'month') return 'month';
    return 'day';
  }

  private normalizeRange(period: 'day' | 'week' | 'month', range?: number) {
    if (range && range > 0) return range;
    if (period === 'week') return 12;
    if (period === 'month') return 12;
    return 30;
  }

  async getRevenueSeries(period?: string, range?: number) {
    const normalizedPeriod = this.normalizePeriod(period);
    const normalizedRange = this.normalizeRange(normalizedPeriod, range);
    const data = await this.adminRepository.getRevenueSeries({
      period: normalizedPeriod,
      range: normalizedRange,
    });

    return {
      period: normalizedPeriod,
      range: normalizedRange,
      data,
    };
  }

  async getOrderStats() {
    const [statusBreakdown, zoneBreakdown, gridBreakdown] = await Promise.all([
      this.adminRepository.getOrderStatusBreakdown(),
      this.adminRepository.getDeliveryZoneBreakdown(),
      this.adminRepository.getGridConfigBreakdown(),
    ]);

    return {
      byStatus: statusBreakdown.map((row) => ({
        status: row.status,
        count: Number(row.count ?? 0),
      })),
      byDeliveryZone: zoneBreakdown.map((row) => ({
        zone: row.zone,
        count: Number(row.count ?? 0),
      })),
      byGridConfig: gridBreakdown.map((row) => ({
        gridConfigId: row.gridConfigId,
        count: Number(row.count ?? 0),
      })),
    };
  }

  async getGenerationStats() {
    const row = await this.adminRepository.getGenerationStats();
    const total = Number(row?.total ?? 0);
    const failed = Number(row?.failed ?? 0);
    const completed = Number(row?.completed ?? 0);
    const avgSeconds = row?.avg_seconds ? Number(row.avg_seconds) : 0;

    const successRate = total > 0 ? Math.round(((total - failed) / total) * 100) : 0;

    return {
      totalJobs: total,
      completedJobs: completed,
      failedJobs: failed,
      successRate,
      averageProcessingSeconds: avgSeconds,
    };
  }

  async getFunnelStats() {
    const row = await this.adminRepository.getFunnelStats();

    return {
      uploads: Number(row?.uploads ?? 0),
      generations: Number(row?.generations ?? 0),
      orders: Number(row?.orders ?? 0),
      paidOrders: Number(row?.paid_orders ?? 0),
    };
  }
}

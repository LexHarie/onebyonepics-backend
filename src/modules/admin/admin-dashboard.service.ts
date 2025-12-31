import type { AdminRepository } from './admin.repository';

export class AdminDashboardService {
  constructor(private readonly adminRepository: AdminRepository) {}

  async getOverview() {
    const row = await this.adminRepository.getDashboardOverview();

    return {
      ordersToday: Number(row?.orders_today ?? 0),
      revenueToday: Number(row?.revenue_today ?? 0),
      pendingOrders: Number(row?.pending_orders ?? 0),
      failedJobs: Number(row?.failed_jobs ?? 0),
    };
  }

  async getStats() {
    const row = await this.adminRepository.getDashboardStats();

    return {
      totalOrders: Number(row?.total_orders ?? 0),
      paidOrders: Number(row?.paid_orders ?? 0),
      totalRevenue: Number(row?.total_revenue ?? 0),
      totalUsers: Number(row?.total_users ?? 0),
      generationJobs: Number(row?.generation_jobs ?? 0),
      failedJobs: Number(row?.failed_jobs ?? 0),
    };
  }
}

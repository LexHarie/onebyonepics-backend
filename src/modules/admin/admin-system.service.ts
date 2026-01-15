import type { AdminRepository } from './admin.repository';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export class AdminSystemService {
  constructor(private readonly adminRepository: AdminRepository) {}

  private normalizePagination(page?: number, pageSize?: number) {
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const offset = (safePage - 1) * safePageSize;
    return { page: safePage, pageSize: safePageSize, offset };
  }

  async getHealth() {
    return {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      serverTime: new Date().toISOString(),
    };
  }

  async getWebhooks(limit = 20) {
    const rows = await this.adminRepository.listWebhookEvents(limit);
    return rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      paymongoPaymentId: row.paymongo_payment_id,
      paymentProvider: row.payment_provider,
      orderNumber: row.order_number,
      paymentStatus: row.payment_status,
      fundSourceType: row.fund_source_type,
      processed: row.processed,
      processingError: row.processing_error,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      verified: row.verified,
      verificationStatus: row.verification_status,
    }));
  }

  async getStorageStats() {
    const row = await this.adminRepository.getStorageStats();
    return {
      uploadedBytes: Number(row?.uploaded_bytes ?? 0),
      uploadedCount: Number(row?.uploaded_count ?? 0),
      generatedBytes: Number(row?.generated_bytes ?? 0),
      generatedCount: Number(row?.generated_count ?? 0),
    };
  }

  async getAuditLogs(params: { page?: number; pageSize?: number }) {
    const { page, pageSize, offset } = this.normalizePagination(
      params.page,
      params.pageSize,
    );

    const { rows, total } = await this.adminRepository.listAuditLogs({
      limit: pageSize,
      offset,
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        adminUserId: row.admin_user_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: row.metadata,
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      })),
      total,
      page,
      pageSize,
    };
  }
}

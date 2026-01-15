import type { SQL } from 'bun';
import { getSql } from '../../lib/database';
import type {
  OrderRow,
  OrderStatus,
  PaymentStatus,
} from '../orders/domain/entities/order.entity';
import type { OrderItemRow } from '../orders/domain/entities/order-item.entity';
import type { GenerationJobRow } from '../generation/domain/entities/generation-job.entity';
import type { GeneratedImageRow } from '../generation/domain/entities/generated-image.entity';
import type { UploadedImageRow } from '../images/domain/entities/image.entity';

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  orderCount: number;
}

export interface AdminAuditLogRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: Date;
}

export interface AdminWebhookRow {
  id: string;
  event_type: string;
  paymongo_payment_id: string | null;
  payment_provider: string | null;
  order_number: string | null;
  payment_status: string | null;
  fund_source_type: string | null;
  processed: boolean;
  processing_error: string | null;
  created_at: Date;
  processed_at: Date | null;
  verified: boolean | null;
  verification_status: string | null;
}

export interface AdminOrderItemSummary {
  id: string;
  order_id: string;
  grid_config_id: string;
  composed_image_key: string | null;
  quantity: number;
}

export interface AdminOrderWithComposedItems {
  order: OrderRow;
  items: AdminOrderItemSummary[];
}

export class AdminRepository {
  constructor(private readonly sql: SQL) {}

  async getDashboardOverview() {
    const rows = await this.sql<
      {
        orders_today: number | string;
        revenue_today: number | string;
        pending_orders: number | string;
        failed_jobs: number | string;
      }[]
    >`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE) AS orders_today,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = 'paid' AND paid_at::date = CURRENT_DATE) AS revenue_today,
        (SELECT COUNT(*) FROM orders WHERE order_status IN ('pending', 'processing')) AS pending_orders,
        (SELECT COUNT(*) FROM generation_jobs WHERE status = 'failed') AS failed_jobs
    `;

    return rows[0];
  }

  async getDashboardStats() {
    const rows = await this.sql<
      {
        total_orders: number | string;
        paid_orders: number | string;
        total_revenue: number | string;
        total_users: number | string;
        generation_jobs: number | string;
        failed_jobs: number | string;
      }[]
    >`
      SELECT
        (SELECT COUNT(*) FROM orders) AS total_orders,
        (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid') AS paid_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE payment_status = 'paid') AS total_revenue,
        (SELECT COUNT(*) FROM "user") AS total_users,
        (SELECT COUNT(*) FROM generation_jobs) AS generation_jobs,
        (SELECT COUNT(*) FROM generation_jobs WHERE status = 'failed') AS failed_jobs
    `;

    return rows[0];
  }

  async listOrders(params: {
    status: OrderStatus | null;
    paymentStatus: PaymentStatus | null;
    search: string | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: OrderRow[]; total: number }> {
    const searchPattern = params.search ? `%${params.search}%` : null;

    const rows = await this.sql<OrderRow[]>`
      SELECT * FROM orders
      WHERE
        (${params.status}::text IS NULL OR order_status = ${params.status})
        AND (${params.paymentStatus}::text IS NULL OR payment_status = ${params.paymentStatus})
        AND (${searchPattern}::text IS NULL OR order_number ILIKE ${searchPattern} OR customer_name ILIKE ${searchPattern} OR customer_email ILIKE ${searchPattern})
        AND (${params.dateFrom}::timestamptz IS NULL OR created_at >= ${params.dateFrom})
        AND (${params.dateTo}::timestamptz IS NULL OR created_at <= ${params.dateTo})
      ORDER BY created_at DESC
      LIMIT ${params.limit} OFFSET ${params.offset}
    `;

    const totalRows = await this.sql<
      { total: number | string }[]
    >`
      SELECT COUNT(*) AS total FROM orders
      WHERE
        (${params.status}::text IS NULL OR order_status = ${params.status})
        AND (${params.paymentStatus}::text IS NULL OR payment_status = ${params.paymentStatus})
        AND (${searchPattern}::text IS NULL OR order_number ILIKE ${searchPattern} OR customer_name ILIKE ${searchPattern} OR customer_email ILIKE ${searchPattern})
        AND (${params.dateFrom}::timestamptz IS NULL OR created_at >= ${params.dateFrom})
        AND (${params.dateTo}::timestamptz IS NULL OR created_at <= ${params.dateTo})
    `;

    return { rows, total: Number(totalRows[0]?.total ?? 0) };
  }

  async findOrderById(orderId: string): Promise<OrderRow | null> {
    const rows = await this.sql<OrderRow[]>`
      SELECT * FROM orders WHERE id = ${orderId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findOrderItemsByOrderId(orderId: string): Promise<OrderItemRow[]> {
    return this.sql<OrderItemRow[]>`
      SELECT * FROM order_items
      WHERE order_id = ${orderId}
      ORDER BY created_at ASC
    `;
  }

  async findOrdersWithComposedImages(orderIds: string[]): Promise<AdminOrderWithComposedItems[]> {
    if (orderIds.length === 0) return [];

    const orderIdsArray = this.sql.array(orderIds, 'uuid');
    const orders = await this.sql<OrderRow[]>`
      SELECT * FROM orders WHERE id = ANY(${orderIdsArray})
    `;

    const items = await this.sql<AdminOrderItemSummary[]>`
      SELECT id, order_id, grid_config_id, composed_image_key, quantity
      FROM order_items
      WHERE order_id = ANY(${orderIdsArray})
      ORDER BY created_at ASC
    `;

    const itemsByOrder = new Map<string, AdminOrderItemSummary[]>();
    for (const item of items) {
      const existing = itemsByOrder.get(item.order_id) ?? [];
      existing.push(item);
      itemsByOrder.set(item.order_id, existing);
    }

    return orders.map((order) => ({
      order,
      items: itemsByOrder.get(order.id) ?? [],
    }));
  }

  async updateOrderStatus(orderId: string, status: OrderStatus, updatedAt: Date): Promise<OrderRow | null> {
    let rows: OrderRow[];

    if (status === 'shipped') {
      rows = await this.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, shipped_at = ${updatedAt}, updated_at = ${updatedAt}
        WHERE id = ${orderId}
        RETURNING *
      `;
    } else if (status === 'delivered') {
      rows = await this.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, delivered_at = ${updatedAt}, updated_at = ${updatedAt}
        WHERE id = ${orderId}
        RETURNING *
      `;
    } else {
      rows = await this.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, updated_at = ${updatedAt}
        WHERE id = ${orderId}
        RETURNING *
      `;
    }

    return rows[0] ?? null;
  }

  async updatePaymentStatus(params: {
    orderId: string;
    status: PaymentStatus;
    paymongoPaymentId: string | null;
    paidAt: Date | null;
    orderStatus: OrderStatus;
    updatedAt: Date;
  }): Promise<OrderRow | null> {
    const rows = await this.sql<OrderRow[]>`
      UPDATE orders
      SET
        payment_status = ${params.status},
        paymongo_payment_id = ${params.paymongoPaymentId},
        payment_provider = 'paymongo',
        paid_at = ${params.paidAt},
        order_status = ${params.orderStatus},
        updated_at = ${params.updatedAt}
      WHERE id = ${params.orderId}
      RETURNING *
    `;

    return rows[0] ?? null;
  }

  async markOrderDownloaded(
    orderId: string,
    adminUserId: string,
    downloadedAt: Date,
  ): Promise<OrderRow | null> {
    const rows = await this.sql<OrderRow[]>`
      UPDATE orders
      SET
        admin_downloaded_at = ${downloadedAt},
        admin_downloaded_by = ${adminUserId},
        updated_at = ${downloadedAt}
      WHERE id = ${orderId} AND admin_downloaded_at IS NULL
      RETURNING *
    `;

    return rows[0] ?? null;
  }

  async markOrderPrinted(
    orderId: string,
    adminUserId: string,
    printedAt: Date,
  ): Promise<OrderRow | null> {
    const rows = await this.sql<OrderRow[]>`
      UPDATE orders
      SET
        admin_printed_at = ${printedAt},
        admin_printed_by = ${adminUserId},
        updated_at = ${printedAt}
      WHERE id = ${orderId} AND admin_printed_at IS NULL
      RETURNING *
    `;

    return rows[0] ?? null;
  }

  async listUsers(params: {
    search: string | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: AdminUserRow[]; total: number }> {
    const searchPattern = params.search ? `%${params.search}%` : null;

    const rows = await this.sql<
      {
        id: string;
        email: string;
        name: string;
        image: string | null;
        role: string | null;
        emailVerified: boolean;
        createdAt: Date;
        updatedAt: Date;
        orderCount: number | string;
      }[]
    >`
      SELECT
        u.id,
        u.email,
        u.name,
        u.image,
        u.role,
        u."emailVerified" AS "emailVerified",
        u."createdAt" AS "createdAt",
        u."updatedAt" AS "updatedAt",
        COUNT(o.id) AS "orderCount"
      FROM "user" u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE
        (${searchPattern}::text IS NULL OR u.email ILIKE ${searchPattern} OR u.name ILIKE ${searchPattern})
      GROUP BY u.id
      ORDER BY u."createdAt" DESC
      LIMIT ${params.limit} OFFSET ${params.offset}
    `;

    const totalRows = await this.sql<
      { total: number | string }[]
    >`
      SELECT COUNT(*) AS total FROM "user"
      WHERE
        (${searchPattern}::text IS NULL OR email ILIKE ${searchPattern} OR name ILIKE ${searchPattern})
    `;

    const mapped = rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      role: row.role,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      orderCount: Number(row.orderCount ?? 0),
    }));

    return { rows: mapped, total: Number(totalRows[0]?.total ?? 0) };
  }

  async findUserById(userId: string): Promise<AdminUserRow | null> {
    const rows = await this.sql<
      {
        id: string;
        email: string;
        name: string;
        image: string | null;
        role: string | null;
        emailVerified: boolean;
        createdAt: Date;
        updatedAt: Date;
        orderCount: number | string;
      }[]
    >`
      SELECT
        u.id,
        u.email,
        u.name,
        u.image,
        u.role,
        u."emailVerified" AS "emailVerified",
        u."createdAt" AS "createdAt",
        u."updatedAt" AS "updatedAt",
        COUNT(o.id) AS "orderCount"
      FROM "user" u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.id = ${userId}
      GROUP BY u.id
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      image: row.image,
      role: row.role,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      orderCount: Number(row.orderCount ?? 0),
    };
  }

  async findUserOrders(userId: string): Promise<OrderRow[]> {
    return this.sql<OrderRow[]>`
      SELECT * FROM orders
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
  }

  async getRevenueSeries(params: {
    period: 'day' | 'week' | 'month';
    range: number;
  }): Promise<{ period: Date; revenue: number; orders: number }[]> {
    const interval = `${params.range} ${params.period}${params.range === 1 ? '' : 's'}`;

    const rows = await this.sql<
      { period: Date; revenue: number | string; orders: number | string }[]
    >`
      SELECT
        date_trunc(${params.period}, paid_at) AS period,
        COALESCE(SUM(total_amount), 0) AS revenue,
        COUNT(*) AS orders
      FROM orders
      WHERE payment_status = 'paid'
        AND paid_at IS NOT NULL
        AND paid_at >= NOW() - ${interval}::interval
      GROUP BY period
      ORDER BY period ASC
    `;

    return rows.map((row) => ({
      period: row.period,
      revenue: Number(row.revenue ?? 0),
      orders: Number(row.orders ?? 0),
    }));
  }

  async getOrderStatusBreakdown() {
    return this.sql<
      { status: string; count: number | string }[]
    >`
      SELECT order_status AS status, COUNT(*) AS count
      FROM orders
      GROUP BY order_status
    `;
  }

  async getDeliveryZoneBreakdown() {
    return this.sql<
      { zone: string; count: number | string }[]
    >`
      SELECT delivery_zone AS zone, COUNT(*) AS count
      FROM orders
      GROUP BY delivery_zone
    `;
  }

  async getGridConfigBreakdown() {
    return this.sql<
      { gridConfigId: string; count: number | string }[]
    >`
      SELECT grid_config_id AS "gridConfigId", COUNT(*) AS count
      FROM orders
      GROUP BY grid_config_id
      ORDER BY COUNT(*) DESC
    `;
  }

  async getGenerationStats() {
    const rows = await this.sql<
      {
        total: number | string;
        failed: number | string;
        completed: number | string;
        avg_seconds: number | string | null;
      }[]
    >`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) AS avg_seconds
      FROM generation_jobs
    `;

    return rows[0];
  }

  async getFunnelStats() {
    const rows = await this.sql<
      {
        uploads: number | string;
        generations: number | string;
        orders: number | string;
        paid_orders: number | string;
      }[]
    >`
      SELECT
        (SELECT COUNT(*) FROM uploaded_images) AS uploads,
        (SELECT COUNT(*) FROM generation_jobs) AS generations,
        (SELECT COUNT(*) FROM orders) AS orders,
        (SELECT COUNT(*) FROM orders WHERE payment_status = 'paid') AS paid_orders
    `;

    return rows[0];
  }

  async listGenerationJobs(params: {
    status: string | null;
    dateFrom: Date | null;
    dateTo: Date | null;
    limit: number;
    offset: number;
  }): Promise<{ rows: GenerationJobRow[]; total: number }> {
    const rows = await this.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs
      WHERE
        (${params.status}::text IS NULL OR status = ${params.status})
        AND (${params.dateFrom}::timestamptz IS NULL OR created_at >= ${params.dateFrom})
        AND (${params.dateTo}::timestamptz IS NULL OR created_at <= ${params.dateTo})
      ORDER BY created_at DESC
      LIMIT ${params.limit} OFFSET ${params.offset}
    `;

    const totalRows = await this.sql<
      { total: number | string }[]
    >`
      SELECT COUNT(*) AS total FROM generation_jobs
      WHERE
        (${params.status}::text IS NULL OR status = ${params.status})
        AND (${params.dateFrom}::timestamptz IS NULL OR created_at >= ${params.dateFrom})
        AND (${params.dateTo}::timestamptz IS NULL OR created_at <= ${params.dateTo})
    `;

    return { rows, total: Number(totalRows[0]?.total ?? 0) };
  }

  async findGenerationJobById(jobId: string): Promise<GenerationJobRow | null> {
    const rows = await this.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findGeneratedImagesByJobId(jobId: string): Promise<GeneratedImageRow[]> {
    return this.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images
      WHERE generation_job_id = ${jobId}
      ORDER BY variation_index ASC
    `;
  }

  async findUploadedImageById(uploadedImageId: string): Promise<UploadedImageRow | null> {
    const rows = await this.sql<UploadedImageRow[]>`
      SELECT * FROM uploaded_images WHERE id = ${uploadedImageId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async resetGenerationJob(jobId: string): Promise<void> {
    await this.sql`
      UPDATE generation_jobs
      SET status = 'pending', error_message = NULL, started_at = NULL, completed_at = NULL
      WHERE id = ${jobId}
    `;
  }

  async listFailedJobs(params: {
    limit: number;
    offset: number;
  }): Promise<{ rows: GenerationJobRow[]; total: number }> {
    const rows = await this.sql<GenerationJobRow[]>`
      SELECT * FROM generation_jobs
      WHERE status = 'failed'
      ORDER BY created_at DESC
      LIMIT ${params.limit} OFFSET ${params.offset}
    `;

    const totalRows = await this.sql<
      { total: number | string }[]
    >`
      SELECT COUNT(*) AS total FROM generation_jobs WHERE status = 'failed'
    `;

    return { rows, total: Number(totalRows[0]?.total ?? 0) };
  }

  async listWebhookEvents(limit: number): Promise<AdminWebhookRow[]> {
    return this.sql<AdminWebhookRow[]>`
      SELECT
        id,
        event_type,
        paymongo_payment_id,
        payment_provider,
        order_number,
        payment_status,
        fund_source_type,
        processed,
        processing_error,
        created_at,
        processed_at,
        verified,
        verification_status
      FROM webhook_events
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  async getStorageStats() {
    const rows = await this.sql<
      {
        uploaded_bytes: number | string;
        uploaded_count: number | string;
        generated_bytes: number | string;
        generated_count: number | string;
      }[]
    >`
      SELECT
        (SELECT COALESCE(SUM(file_size), 0) FROM uploaded_images) AS uploaded_bytes,
        (SELECT COUNT(*) FROM uploaded_images) AS uploaded_count,
        (SELECT COALESCE(SUM(file_size), 0) FROM generated_images) AS generated_bytes,
        (SELECT COUNT(*) FROM generated_images) AS generated_count
    `;

    return rows[0];
  }

  async insertAuditLog(params: {
    adminUserId: string;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata: Record<string, unknown> | null;
    ipAddress: string | null;
  }): Promise<void> {
    await this.sql`
      INSERT INTO admin_audit_logs (
        admin_user_id,
        action,
        target_type,
        target_id,
        metadata,
        ip_address
      ) VALUES (
        ${params.adminUserId},
        ${params.action},
        ${params.targetType},
        ${params.targetId},
        ${params.metadata ? JSON.stringify(params.metadata) : null},
        ${params.ipAddress}
      )
    `;
  }

  async listAuditLogs(params: {
    limit: number;
    offset: number;
  }): Promise<{ rows: AdminAuditLogRow[]; total: number }> {
    const rows = await this.sql<AdminAuditLogRow[]>`
      SELECT * FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT ${params.limit} OFFSET ${params.offset}
    `;

    const totalRows = await this.sql<
      { total: number | string }[]
    >`
      SELECT COUNT(*) AS total FROM admin_audit_logs
    `;

    return { rows, total: Number(totalRows[0]?.total ?? 0) };
  }
}

export const createAdminRepository = () => new AdminRepository(getSql());

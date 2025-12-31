import { Elysia } from 'elysia';
import type { Auth } from 'better-auth';
import { getAuthSession } from '../../lib/auth-session';
import { httpError } from '../../lib/http-error';
import { generationService } from '../generation';
import { ordersService } from '../orders';
import { MayaService } from '../payments/maya.service';
import { StorageService } from '../storage/storage.service';
import { createWebhookEventsRepository } from '../webhooks/webhook-events.repository';
import { WebhookEventsService } from '../webhooks/webhook-events.service';
import { createAdminRepository } from './admin.repository';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminGenerationService } from './admin-generation.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminSystemService } from './admin-system.service';
import { AdminUsersService } from './admin-users.service';
import { adminSchema } from './admin.schema';
import { authContextPlugin } from '../../plugins/auth.plugin';

type AdminSessionUser = {
  id: string;
  role?: string | string[] | null;
};

const isAdminRole = (role: unknown) => {
  if (typeof role === 'string') {
    return role.toLowerCase() === 'admin';
  }
  if (Array.isArray(role)) {
    return role.some(
      (value) => typeof value === 'string' && value.toLowerCase() === 'admin',
    );
  }
  return false;
};

const requireAdmin = async (
  auth: Auth,
  request: Request,
): Promise<AdminSessionUser> => {
  const session = await getAuthSession(auth, request);
  const user = session?.user as Partial<AdminSessionUser> | undefined;

  if (!user?.id || typeof user.id !== 'string') {
    throw httpError(401, 'Unauthorized');
  }

  if (!isAdminRole(user.role)) {
    throw httpError(403, 'Forbidden');
  }

  return { id: user.id, role: user.role ?? null };
};

const normalizeIp = (ip: string | null) => {
  if (!ip) return null;
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }
  return ip;
};

const getClientIp = (request: Request): string | null => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return normalizeIp(forwardedFor.split(',')[0]?.trim() ?? null);
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return normalizeIp(realIp.trim());
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return normalizeIp(cfIp.trim());
  }

  return null;
};

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw httpError(400, `Invalid date: ${value}`);
  }
  return parsed;
};

const adminRepository = createAdminRepository();
const mayaService = new MayaService();
const webhookEventsService = new WebhookEventsService(
  createWebhookEventsRepository(),
  ordersService,
  mayaService,
);
const storageService = new StorageService();
const adminDashboardService = new AdminDashboardService(adminRepository);
const adminOrdersService = new AdminOrdersService(
  adminRepository,
  mayaService,
  ordersService,
  webhookEventsService,
  storageService,
);
const adminUsersService = new AdminUsersService(adminRepository);
const adminAnalyticsService = new AdminAnalyticsService(adminRepository);
const adminGenerationService = new AdminGenerationService(
  adminRepository,
  generationService,
);
const adminSystemService = new AdminSystemService(adminRepository);

export const adminModule = new Elysia({ name: 'admin' })
  .use(authContextPlugin)
  .get('/admin/dashboard', async ({ request, auth }) => {
    await requireAdmin(auth, request);
    return adminDashboardService.getOverview();
  })
  .get('/admin/dashboard/stats', async ({ request, auth }) => {
    await requireAdmin(auth, request);
    return adminDashboardService.getStats();
  })
  .get(
    '/admin/orders',
    async ({ query, request, auth }) => {
      await requireAdmin(auth, request);
      return adminOrdersService.listOrders({
        status: query.status
          ? adminOrdersService.validateOrderStatus(query.status)
          : undefined,
        paymentStatus: query.paymentStatus
          ? adminOrdersService.validatePaymentStatus(query.paymentStatus)
          : undefined,
        search: query.search,
        dateFrom: parseDate(query.dateFrom),
        dateTo: parseDate(query.dateTo),
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    {
      query: adminSchema.orderQuery,
    },
  )
  .get(
    '/admin/orders/:id',
    async ({ params, request, auth }) => {
      await requireAdmin(auth, request);
      return adminOrdersService.getOrder(params.id);
    },
    {
      params: adminSchema.idParams,
    },
  )
  .get(
    '/admin/orders/:id/download',
    async ({ params, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      return adminOrdersService.getComposedImageDownload(
        params.id,
        adminUser.id,
        ipAddress,
      );
    },
    {
      params: adminSchema.idParams,
    },
  )
  .post(
    '/admin/orders/bulk-download',
    async ({ body, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      return adminOrdersService.generateBulkDownloadZip(
        body.orderIds,
        adminUser.id,
        ipAddress,
      );
    },
    {
      body: adminSchema.bulkDownload,
    },
  )
  .patch(
    '/admin/orders/:id/status',
    async ({ params, body, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      const status = adminOrdersService.validateOrderStatus(body.status);
      return adminOrdersService.updateOrderStatus(
        params.id,
        status,
        adminUser.id,
        ipAddress,
      );
    },
    {
      params: adminSchema.idParams,
      body: adminSchema.updateOrderStatus,
    },
  )
  .patch(
    '/admin/orders/:id/payment',
    async ({ params, body, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      const status = adminOrdersService.validatePaymentStatus(body.status);
      return adminOrdersService.updatePaymentStatus(
        params.id,
        status,
        body.mayaPaymentId ?? null,
        adminUser.id,
        ipAddress,
      );
    },
    {
      params: adminSchema.idParams,
      body: adminSchema.updatePaymentStatus,
    },
  )
  .post(
    '/admin/orders/:id/resend-email',
    async ({ params, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      return adminOrdersService.resendOrderEmail(
        params.id,
        adminUser.id,
        ipAddress,
      );
    },
    {
      params: adminSchema.idParams,
    },
  )
  .post(
    '/admin/orders/:id/verify-and-process',
    async ({ params, body, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      return adminOrdersService.verifyAndProcessPayment(
        params.id,
        body.force ?? false,
        adminUser.id,
        ipAddress,
      );
    },
    {
      params: adminSchema.idParams,
      body: adminSchema.verifyPayment,
    },
  )
  .patch(
    '/admin/orders/:id/mark-printed',
    async ({ params, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      return adminOrdersService.markAsPrinted(
        params.id,
        adminUser.id,
        ipAddress,
      );
    },
    {
      params: adminSchema.idParams,
    },
  )
  .get(
    '/admin/users',
    async ({ query, request, auth }) => {
      await requireAdmin(auth, request);
      return adminUsersService.listUsers({
        search: query.search,
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    {
      query: adminSchema.usersQuery,
    },
  )
  .get(
    '/admin/users/:id',
    async ({ params, request, auth }) => {
      await requireAdmin(auth, request);
      return adminUsersService.getUser(params.id);
    },
    {
      params: adminSchema.idParams,
    },
  )
  .get(
    '/admin/users/:id/orders',
    async ({ params, request, auth }) => {
      await requireAdmin(auth, request);
      return adminUsersService.getUserOrders(params.id);
    },
    {
      params: adminSchema.idParams,
    },
  )
  .get(
    '/admin/analytics/revenue',
    async ({ query, request, auth }) => {
      await requireAdmin(auth, request);
      return adminAnalyticsService.getRevenueSeries(query.period, query.range);
    },
    {
      query: adminSchema.analyticsRevenueQuery,
    },
  )
  .get('/admin/analytics/orders', async ({ request, auth }) => {
    await requireAdmin(auth, request);
    return adminAnalyticsService.getOrderStats();
  })
  .get('/admin/analytics/generation', async ({ request, auth }) => {
    await requireAdmin(auth, request);
    return adminAnalyticsService.getGenerationStats();
  })
  .get('/admin/analytics/funnel', async ({ request, auth }) => {
    await requireAdmin(auth, request);
    return adminAnalyticsService.getFunnelStats();
  })
  .get(
    '/admin/generation/jobs',
    async ({ query, request, auth }) => {
      await requireAdmin(auth, request);
      return adminGenerationService.listJobs({
        status: query.status,
        dateFrom: parseDate(query.dateFrom),
        dateTo: parseDate(query.dateTo),
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    {
      query: adminSchema.generationQuery,
    },
  )
  .get(
    '/admin/generation/jobs/:id',
    async ({ params, request, auth }) => {
      await requireAdmin(auth, request);
      return adminGenerationService.getJob(params.id);
    },
    {
      params: adminSchema.idParams,
    },
  )
  .get(
    '/admin/generation/failed',
    async ({ query, request, auth }) => {
      await requireAdmin(auth, request);
      return adminGenerationService.listFailedJobs({
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    {
      query: adminSchema.auditLogsQuery,
    },
  )
  .post(
    '/admin/generation/jobs/:id/retry',
    async ({ params, request, auth }) => {
      const adminUser = await requireAdmin(auth, request);
      const ipAddress = getClientIp(request);
      return adminGenerationService.retryJob(
        params.id,
        adminUser.id,
        ipAddress,
      );
    },
    {
      params: adminSchema.idParams,
    },
  )
  .get('/admin/system/health', async ({ request, auth }) => {
    await requireAdmin(auth, request);
    return adminSystemService.getHealth();
  })
  .get(
    '/admin/system/webhooks',
    async ({ query, request, auth }) => {
      await requireAdmin(auth, request);
      return adminSystemService.getWebhooks(query.limit);
    },
    {
      query: adminSchema.webhooksQuery,
    },
  )
  .get('/admin/system/storage', async ({ request, auth }) => {
    await requireAdmin(auth, request);
    return adminSystemService.getStorageStats();
  })
  .get(
    '/admin/system/audit-logs',
    async ({ query, request, auth }) => {
      await requireAdmin(auth, request);
      return adminSystemService.getAuditLogs({
        page: query.page,
        pageSize: query.pageSize,
      });
    },
    {
      query: adminSchema.auditLogsQuery,
    },
  );

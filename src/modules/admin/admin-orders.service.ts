import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import archiver from 'archiver';
import {
  rowToOrder,
  type OrderStatus,
  type PaymentStatus,
} from '../orders/domain/entities/order.entity';
import { rowToOrderItem } from '../orders/domain/entities/order-item.entity';
import { rowToGeneratedImage } from '../generation/domain/entities/generated-image.entity';
import { rowToGenerationJob } from '../generation/domain/entities/generation-job.entity';
import { httpError } from '../../lib/http-error';
import { AppLogger } from '../../lib/logger';
import type { AdminRepository } from './admin.repository';
import type { MayaService } from '../payments/maya.service';
import type { OrdersService } from '../orders/orders.service';
import type { WebhookEventsService } from '../webhooks/webhook-events.service';
import type { StorageService } from '../storage/storage.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export class AdminOrdersService {
  private readonly logger = new AppLogger('AdminOrdersService');
  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly mayaService: MayaService,
    private readonly ordersService: OrdersService,
    private readonly webhookEventsService: WebhookEventsService,
    private readonly storageService: StorageService,
  ) {}

  private normalizePagination(page?: number, pageSize?: number) {
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE),
    );
    const offset = (safePage - 1) * safePageSize;
    return { page: safePage, pageSize: safePageSize, offset };
  }

  async listOrders(params: {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    pageSize?: number;
  }) {
    const { page, pageSize, offset } = this.normalizePagination(
      params.page,
      params.pageSize,
    );

    const { rows, total } = await this.adminRepository.listOrders({
      status: params.status ?? null,
      paymentStatus: params.paymentStatus ?? null,
      search: params.search?.trim() || null,
      dateFrom: params.dateFrom ?? null,
      dateTo: params.dateTo ?? null,
      limit: pageSize,
      offset,
    });

    return {
      items: rows.map(rowToOrder),
      total,
      page,
      pageSize,
    };
  }

  async getOrder(orderId: string) {
    const row = await this.adminRepository.findOrderById(orderId);
    if (!row) {
      throw httpError(404, 'Order not found');
    }

    const order = rowToOrder(row);
    const user = order.userId
      ? await this.adminRepository.findUserById(order.userId)
      : null;
    const generationJobRow = order.generationJobId
      ? await this.adminRepository.findGenerationJobById(order.generationJobId)
      : null;
    const generatedImages = order.generationJobId
      ? await this.adminRepository.findGeneratedImagesByJobId(order.generationJobId)
      : [];
    const orderItems = await this.adminRepository.findOrderItemsByOrderId(orderId);

    const itemsWithUrls = await Promise.all(
      orderItems.map(async (itemRow) => {
        const item = rowToOrderItem(itemRow);
        let composedImageUrl: string | null = null;
        if (item.composedImageKey) {
          try {
            composedImageUrl = await this.storageService.getSignedUrl(
              item.composedImageKey,
              3600,
            );
          } catch (error) {
            this.logger.warn(
              `Failed to get signed URL for item ${item.id}: ${(error as Error).message}`,
            );
          }
        }
        return { ...item, composedImageUrl };
      }),
    );

    return {
      ...order,
      user,
      generationJob: generationJobRow ? rowToGenerationJob(generationJobRow) : null,
      generatedImages: generatedImages.map(rowToGeneratedImage),
      items: itemsWithUrls,
    };
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    adminUserId: string,
    ipAddress: string | null,
  ) {
    const existing = await this.adminRepository.findOrderById(orderId);
    if (!existing) {
      throw httpError(404, 'Order not found');
    }

    const updated = await this.adminRepository.updateOrderStatus(
      orderId,
      status,
      new Date(),
    );

    if (!updated) {
      throw httpError(404, 'Order not found');
    }

    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: 'order.status.update',
      targetType: 'order',
      targetId: orderId,
      metadata: {
        from: existing.order_status,
        to: status,
      },
      ipAddress,
    });

    return rowToOrder(updated);
  }

  async updatePaymentStatus(
    orderId: string,
    status: PaymentStatus,
    mayaPaymentId: string | null,
    adminUserId: string,
    ipAddress: string | null,
  ) {
    const existing = await this.adminRepository.findOrderById(orderId);
    if (!existing) {
      throw httpError(404, 'Order not found');
    }

    const paidAt = status === 'paid' ? new Date() : null;
    const orderStatus: OrderStatus = status === 'paid' ? 'processing' : 'pending';

    const updated = await this.adminRepository.updatePaymentStatus({
      orderId,
      status,
      mayaPaymentId,
      paidAt,
      orderStatus,
      updatedAt: new Date(),
    });

    if (!updated) {
      throw httpError(404, 'Order not found');
    }

    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: 'order.payment.update',
      targetType: 'order',
      targetId: orderId,
      metadata: {
        from: existing.payment_status,
        to: status,
        mayaPaymentId,
      },
      ipAddress,
    });

    return rowToOrder(updated);
  }

  async resendOrderEmail(orderId: string, adminUserId: string, ipAddress: string | null) {
    const existing = await this.adminRepository.findOrderById(orderId);
    if (!existing) {
      throw httpError(404, 'Order not found');
    }

    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: 'order.email.resend',
      targetType: 'order',
      targetId: orderId,
      metadata: {
        email: existing.customer_email,
      },
      ipAddress,
    });

    return {
      queued: true,
      message: 'Resend request queued',
    };
  }

  validateOrderStatus(status: string): OrderStatus {
    const allowed: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status as OrderStatus)) {
      throw httpError(400, 'Invalid order status');
    }
    return status as OrderStatus;
  }

  validatePaymentStatus(status: string): PaymentStatus {
    const allowed: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded'];
    if (!allowed.includes(status as PaymentStatus)) {
      throw httpError(400, 'Invalid payment status');
    }
    return status as PaymentStatus;
  }

  async verifyAndProcessPayment(
    orderId: string,
    force: boolean,
    adminUserId: string,
    ipAddress: string | null,
  ) {
    const orderRow = await this.adminRepository.findOrderById(orderId);
    if (!orderRow) {
      throw httpError(404, 'Order not found');
    }

    const order = rowToOrder(orderRow);

    if (order.paymentStatus === 'paid') {
      return {
        success: true,
        message: 'Order is already marked as paid',
        alreadyPaid: true,
        order,
      };
    }

    const webhooks = await this.webhookEventsService.getWebhookHistory(order.orderNumber);
    const successWebhook = webhooks.find(
      (w) => w.paymentStatus === 'PAYMENT_SUCCESS' || w.paymentStatus === 'AUTHORIZED',
    );

    let verified = false;
    let verificationDetails: Record<string, unknown> = {};

    if (!force && order.mayaCheckoutId) {
      try {
        const mayaCheckout = await this.mayaService.getCheckout(order.mayaCheckoutId);

        if (mayaCheckout) {
          const apiStatus = mayaCheckout.paymentStatus || (mayaCheckout as any).status;

          let apiAmountPhp: number;
          const totalAmt = mayaCheckout.totalAmount as any;

          if (totalAmt?.amount !== undefined) {
            apiAmountPhp = Number(totalAmt.amount);
          } else if (totalAmt?.value !== undefined) {
            apiAmountPhp = Number(totalAmt.value);
          } else if ((mayaCheckout as any).amount !== undefined) {
            apiAmountPhp = Number((mayaCheckout as any).amount);
          } else {
            apiAmountPhp = 0;
          }
          const apiAmount = Math.round(apiAmountPhp * 100);

          const successStatuses = ['PAYMENT_SUCCESS', 'AUTHORIZED'];

          verified =
            successStatuses.includes(apiStatus) && Math.abs(apiAmount - order.totalAmount) <= 1;

          verificationDetails = {
            mayaStatus: apiStatus,
            mayaAmount: apiAmount,
            orderAmount: order.totalAmount,
            statusMatch: successStatuses.includes(apiStatus),
            amountMatch: Math.abs(apiAmount - order.totalAmount) <= 1,
          };
        } else {
          verificationDetails = { error: 'Maya API returned null' };
        }
      } catch (error) {
        verificationDetails = { error: (error as Error).message };
      }
    }

    if (!verified && !force) {
      return {
        success: false,
        message: 'Payment verification failed. Use force=true to bypass.',
        verified: false,
        verificationDetails,
        webhookFound: !!successWebhook,
        order,
      };
    }

    const paidAt = new Date();
    const updatedRow = await this.adminRepository.updatePaymentStatus({
      orderId,
      status: 'paid',
      mayaPaymentId: successWebhook?.mayaPaymentId ?? null,
      paidAt,
      orderStatus: 'processing',
      updatedAt: paidAt,
    });

    try {
      await this.ordersService.composeAndStoreImage(orderId);
    } catch (error) {
      this.logger.error(
        `Failed to compose image for ${order.orderNumber}: ${(error as Error).message}`,
      );
    }

    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: force ? 'order.payment.force_process' : 'order.payment.verify_process',
      targetType: 'order',
      targetId: orderId,
      metadata: {
        force,
        verified,
        verificationDetails,
        webhookId: successWebhook?.id ?? null,
      },
      ipAddress,
    });

    return {
      success: true,
      message: force
        ? 'Payment force-processed successfully'
        : 'Payment verified and processed successfully',
      verified,
      forced: force,
      verificationDetails,
      order: updatedRow ? rowToOrder(updatedRow) : order,
    };
  }

  private getImageExtension(storageKey: string) {
    const match = storageKey.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : 'jpg';
  }

  private formatDownloadTimestamp(date: Date) {
    return date.toISOString().replace(/[:.]/g, '-');
  }

  private sanitizeFilenamePart(value: string) {
    const safe = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return safe || 'unknown';
  }

  private buildOrderPrefix(params: {
    orderNumber: string;
    customerName: string;
    timestamp: string;
  }) {
    const safeOrder = this.sanitizeFilenamePart(params.orderNumber);
    const safeCustomer = this.sanitizeFilenamePart(params.customerName);
    return `${safeOrder}-${safeCustomer}-${params.timestamp}`;
  }

  private buildOrderFilename(params: {
    orderNumber: string;
    customerName: string;
    extension: string;
    timestamp: string;
  }) {
    const safeOrder = this.sanitizeFilenamePart(params.orderNumber);
    const safeCustomer = this.sanitizeFilenamePart(params.customerName);
    return `onebyonepics-${safeOrder}-${safeCustomer}-${params.timestamp}.${params.extension}`;
  }

  private buildOrderItemFilename(params: {
    orderNumber: string;
    customerName: string;
    gridConfigId: string;
    index: number;
    quantity: number;
    extension: string;
    timestamp?: string;
  }) {
    const safeOrder = this.sanitizeFilenamePart(params.orderNumber);
    const safeCustomer = this.sanitizeFilenamePart(params.customerName);
    const safeConfig = this.sanitizeFilenamePart(params.gridConfigId || 'item');
    const suffix = params.timestamp ? `-${params.timestamp}` : '';
    return `onebyonepics-${safeOrder}-${safeCustomer}-item-${params.index}-qty-${params.quantity}-${safeConfig}${suffix}.${params.extension}`;
  }

  private async createZipBuffer(entries: { key: string; filename: string }[]) {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = new PassThrough();
    const chunks: Buffer[] = [];

    const zipBufferPromise = new Promise<Buffer>((resolve, reject) => {
      output.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      output.on('end', () => resolve(Buffer.concat(chunks)));
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (warning: Error) => {
        this.logger.warn(`Archive warning: ${warning.message}`);
      });
    });

    archive.pipe(output);

    for (const entry of entries) {
      const buffer = await this.storageService.getObjectBuffer(entry.key);
      archive.append(buffer, { name: entry.filename });
    }

    await archive.finalize();
    return zipBufferPromise;
  }

  async getComposedImageDownload(
    orderId: string,
    adminUserId: string,
    ipAddress: string | null,
  ) {
    let orderRow = await this.adminRepository.findOrderById(orderId);
    if (!orderRow) {
      throw httpError(404, 'Order not found');
    }

    const downloadedAt = new Date();
    const timestamp = this.formatDownloadTimestamp(downloadedAt);

    let orderItems = await this.adminRepository.findOrderItemsByOrderId(orderId);
    if (!orderRow.composed_image_key && orderItems.every((item) => !item.composed_image_key)) {
      try {
        await this.ordersService.composeAndStoreImage(orderId);
      } catch (error) {
        this.logger.warn(
          `Failed to compose order ${orderId} before admin download: ${(error as Error).message}`,
        );
      }
      orderRow = await this.adminRepository.findOrderById(orderId);
      orderItems = await this.adminRepository.findOrderItemsByOrderId(orderId);
    }

    if (!orderRow) {
      throw httpError(404, 'Order not found');
    }

    if (orderRow.composed_image_key) {
      const composedKey = orderRow.composed_image_key;
      const extension = this.getImageExtension(composedKey);
      const filename = this.buildOrderFilename({
        orderNumber: orderRow.order_number,
        customerName: orderRow.customer_name,
        extension,
        timestamp,
      });
      const downloadUrl = await this.storageService.getSignedUrl(
        composedKey,
        3600,
        filename,
      );
      if (!orderRow.admin_downloaded_at) {
        await this.adminRepository.markOrderDownloaded(orderId, adminUserId, downloadedAt);
      }
      await this.adminRepository.insertAuditLog({
        adminUserId,
        action: 'order.download.admin',
        targetType: 'order',
        targetId: orderId,
        metadata: {
          orderNumber: orderRow.order_number,
          type: 'single',
        },
        ipAddress,
      });
      return { downloadUrl, filename };
    }

    const composedItems = orderItems.filter((item) => item.composed_image_key);
    if (composedItems.length === 0) {
      throw httpError(400, 'Composed image not yet available');
    }

    if (composedItems.length === 1) {
      const item = composedItems[0];
      const composedKey = item.composed_image_key as string;
      const extension = this.getImageExtension(composedKey);
      const filename = this.buildOrderItemFilename({
        orderNumber: orderRow.order_number,
        customerName: orderRow.customer_name,
        gridConfigId: item.grid_config_id,
        index: 1,
        quantity: item.quantity,
        extension,
        timestamp,
      });
      const downloadUrl = await this.storageService.getSignedUrl(
        composedKey,
        3600,
        filename,
      );
      if (!orderRow.admin_downloaded_at) {
        await this.adminRepository.markOrderDownloaded(orderId, adminUserId, downloadedAt);
      }
      await this.adminRepository.insertAuditLog({
        adminUserId,
        action: 'order.download.admin',
        targetType: 'order',
        targetId: orderId,
        metadata: {
          orderNumber: orderRow.order_number,
          type: 'single',
        },
        ipAddress,
      });
      return { downloadUrl, filename };
    }

    const entries = composedItems.map((item, index) => {
      const composedKey = item.composed_image_key as string;
      const extension = this.getImageExtension(composedKey);
      return {
        key: composedKey,
        filename: this.buildOrderItemFilename({
          orderNumber: orderRow.order_number,
          customerName: orderRow.customer_name,
          gridConfigId: item.grid_config_id,
          index: index + 1,
          quantity: item.quantity,
          extension,
          timestamp,
        }),
      };
    });

    const zipBuffer = await this.createZipBuffer(entries);
    const zipFilename = `onebyonepics-${this.buildOrderPrefix({
      orderNumber: orderRow.order_number,
      customerName: orderRow.customer_name,
      timestamp,
    })}.zip`;
    const zipKey = `admin/downloads/${new Date().toISOString()}/${randomUUID()}.zip`;
    await this.storageService.uploadObject(zipKey, zipBuffer, 'application/zip');
    const downloadUrl = await this.storageService.getSignedUrl(zipKey, 3600, zipFilename);

    if (!orderRow.admin_downloaded_at) {
      await this.adminRepository.markOrderDownloaded(orderId, adminUserId, downloadedAt);
    }
    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: 'order.download.admin',
      targetType: 'order',
      targetId: orderId,
      metadata: {
        orderNumber: orderRow.order_number,
        type: 'zip',
      },
      ipAddress,
    });

    return { downloadUrl, filename: zipFilename };
  }

  async generateBulkDownloadZip(
    orderIds: string[],
    adminUserId: string,
    ipAddress: string | null,
  ) {
    if (orderIds.length === 0) {
      throw httpError(400, 'Order ids are required');
    }

    let ordersWithItems = await this.adminRepository.findOrdersWithComposedImages(orderIds);
    if (ordersWithItems.length === 0) {
      throw httpError(404, 'Orders not found');
    }

    const pendingOrderIds = ordersWithItems
      .filter((entry) => {
        if (entry.order.composed_image_key) return false;
        if (entry.items.length === 0) return true;
        return entry.items.some((item) => !item.composed_image_key);
      })
      .map((entry) => entry.order.id);

    if (pendingOrderIds.length > 0) {
      for (const orderId of pendingOrderIds) {
        try {
          await this.ordersService.composeAndStoreImage(orderId);
        } catch (error) {
          this.logger.warn(
            `Failed to compose order ${orderId} during bulk download: ${(error as Error).message}`,
          );
        }
      }
      ordersWithItems = await this.adminRepository.findOrdersWithComposedImages(orderIds);
    }

    const downloadedAt = new Date();
    const timestamp = this.formatDownloadTimestamp(downloadedAt);
    const missingComposed: string[] = [];
    const zipEntries: { key: string; filename: string }[] = [];
    const downloadedOrderIds: string[] = [];

    for (const entry of ordersWithItems) {
      if (entry.order.composed_image_key) {
        const composedKey = entry.order.composed_image_key;
        const extension = this.getImageExtension(composedKey);
        zipEntries.push({
          key: composedKey,
          filename: this.buildOrderFilename({
            orderNumber: entry.order.order_number,
            customerName: entry.order.customer_name,
            extension,
            timestamp,
          }),
        });
        downloadedOrderIds.push(entry.order.id);
        continue;
      }

      if (entry.items.length === 0) {
        missingComposed.push(entry.order.order_number);
        continue;
      }

      const missingItems = entry.items.filter((item) => !item.composed_image_key);
      if (missingItems.length > 0) {
        missingComposed.push(entry.order.order_number);
        continue;
      }

      entry.items.forEach((item, index) => {
        const composedKey = item.composed_image_key as string;
        const extension = this.getImageExtension(composedKey);
        zipEntries.push({
          key: composedKey,
          filename: this.buildOrderItemFilename({
            orderNumber: entry.order.order_number,
            customerName: entry.order.customer_name,
            gridConfigId: item.grid_config_id,
            index: index + 1,
            quantity: item.quantity,
            extension,
            timestamp,
          }),
        });
      });
      downloadedOrderIds.push(entry.order.id);
    }

    if (missingComposed.length > 0) {
      throw httpError(
        400,
        `Composed images not available for orders: ${missingComposed.join(', ')}`,
      );
    }

    if (zipEntries.length === 0) {
      throw httpError(400, 'No composed images available for download');
    }
    const zipBuffer = await this.createZipBuffer(zipEntries);

    const zipFilename = `onebyonepics-orders-${timestamp}.zip`;
    const zipKey = `admin/downloads/${new Date().toISOString()}/${randomUUID()}.zip`;
    await this.storageService.uploadObject(zipKey, zipBuffer, 'application/zip');

    const downloadUrl = await this.storageService.getSignedUrl(
      zipKey,
      3600,
      zipFilename,
    );

    for (const orderId of downloadedOrderIds) {
      const orderRow = ordersWithItems.find((entry) => entry.order.id === orderId)?.order;
      if (orderRow && !orderRow.admin_downloaded_at) {
        await this.adminRepository.markOrderDownloaded(orderId, adminUserId, downloadedAt);
      }
    }

    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: 'order.download.bulk',
      targetType: 'order',
      targetId: null,
      metadata: {
        orderIds,
        zipKey,
      },
      ipAddress,
    });

    return { downloadUrl, filename: zipFilename };
  }

  async markAsPrinted(
    orderId: string,
    adminUserId: string,
    ipAddress: string | null,
  ) {
    const orderRow = await this.adminRepository.findOrderById(orderId);
    if (!orderRow) {
      throw httpError(404, 'Order not found');
    }

    if (!orderRow.admin_downloaded_at) {
      throw httpError(400, 'Order has not been downloaded yet');
    }

    const printedAt = new Date();
    const updated = await this.adminRepository.markOrderPrinted(orderId, adminUserId, printedAt);
    const finalRow = updated ?? orderRow;

    await this.adminRepository.insertAuditLog({
      adminUserId,
      action: 'order.print.mark',
      targetType: 'order',
      targetId: orderId,
      metadata: {
        orderNumber: orderRow.order_number,
      },
      ipAddress,
    });

    return rowToOrder(finalRow);
  }
}

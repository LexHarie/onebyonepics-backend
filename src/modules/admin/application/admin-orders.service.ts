import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  rowToOrder,
  type OrderStatus,
  type PaymentStatus,
} from '../../orders/domain/entities/order.entity';
import { rowToGeneratedImage } from '../../generation/domain/entities/generated-image.entity';
import { rowToGenerationJob } from '../../generation/domain/entities/generation-job.entity';
import { AdminRepository } from '../infrastructure/repositories/admin.repository';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminOrdersService {
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
      throw new NotFoundException('Order not found');
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

    return {
      ...order,
      user,
      generationJob: generationJobRow ? rowToGenerationJob(generationJobRow) : null,
      generatedImages: generatedImages.map(rowToGeneratedImage),
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
      throw new NotFoundException('Order not found');
    }

    const updated = await this.adminRepository.updateOrderStatus(
      orderId,
      status,
      new Date(),
    );

    if (!updated) {
      throw new NotFoundException('Order not found');
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
      throw new NotFoundException('Order not found');
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
      throw new NotFoundException('Order not found');
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
      throw new NotFoundException('Order not found');
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
      throw new BadRequestException('Invalid order status');
    }
    return status as OrderStatus;
  }

  validatePaymentStatus(status: string): PaymentStatus {
    const allowed: PaymentStatus[] = ['pending', 'paid', 'failed', 'refunded'];
    if (!allowed.includes(status as PaymentStatus)) {
      throw new BadRequestException('Invalid payment status');
    }
    return status as PaymentStatus;
  }
}

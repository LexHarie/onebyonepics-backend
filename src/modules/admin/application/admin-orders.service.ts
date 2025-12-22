import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  rowToOrder,
  type OrderStatus,
  type PaymentStatus,
} from '../../orders/domain/entities/order.entity';
import { rowToGeneratedImage } from '../../generation/domain/entities/generated-image.entity';
import { rowToGenerationJob } from '../../generation/domain/entities/generation-job.entity';
import { AdminRepository } from '../infrastructure/repositories/admin.repository';
import { MayaService } from '../../payments/infrastructure/maya.service';
import { OrdersService } from '../../orders/application/orders.service';
import { WebhookEventsService } from '../../webhooks/application/webhook-events.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminOrdersService {
  private readonly logger = new Logger(AdminOrdersService.name);

  constructor(
    private readonly adminRepository: AdminRepository,
    @Inject(forwardRef(() => MayaService))
    private readonly mayaService: MayaService,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    @Inject(forwardRef(() => WebhookEventsService))
    private readonly webhookEventsService: WebhookEventsService,
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

  /**
   * Verify payment with Maya API and process the order.
   * If force=true, skip verification and directly process as paid.
   */
  async verifyAndProcessPayment(
    orderId: string,
    force: boolean,
    adminUserId: string,
    ipAddress: string | null,
  ) {
    const orderRow = await this.adminRepository.findOrderById(orderId);
    if (!orderRow) {
      throw new NotFoundException('Order not found');
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

    // Get webhook history for this order
    const webhooks = await this.webhookEventsService.getWebhookHistory(order.orderNumber);
    const successWebhook = webhooks.find(
      (w) => w.paymentStatus === 'PAYMENT_SUCCESS' || w.paymentStatus === 'AUTHORIZED',
    );

    let verified = false;
    let verificationDetails: Record<string, unknown> = {};

    if (!force && order.mayaCheckoutId) {
      // Try to verify with Maya API
      this.logger.log(`Admin verifying payment for order ${order.orderNumber}`);

      try {
        const mayaCheckout = await this.mayaService.getCheckout(order.mayaCheckoutId);

        if (mayaCheckout) {
          // Handle different Maya API response formats
          const apiStatus = mayaCheckout.paymentStatus || (mayaCheckout as any).status;

          // Extract amount - can be totalAmount.value or just amount (string in PHP)
          let apiAmountPhp: number;
          if (mayaCheckout.totalAmount?.value !== undefined) {
            apiAmountPhp = Number(mayaCheckout.totalAmount.value);
          } else if ((mayaCheckout as any).amount !== undefined) {
            apiAmountPhp = Number((mayaCheckout as any).amount);
          } else {
            apiAmountPhp = 0;
          }
          const apiAmount = Math.round(apiAmountPhp * 100);

          const successStatuses = ['PAYMENT_SUCCESS', 'AUTHORIZED'];

          verified = successStatuses.includes(apiStatus) && Math.abs(apiAmount - order.totalAmount) <= 1;

          verificationDetails = {
            mayaStatus: apiStatus,
            mayaAmount: apiAmount,
            orderAmount: order.totalAmount,
            statusMatch: successStatuses.includes(apiStatus),
            amountMatch: Math.abs(apiAmount - order.totalAmount) <= 1,
          };

          this.logger.log(
            `Maya API verification for ${order.orderNumber}: verified=${verified}, ` +
              `status=${apiStatus}, amount=${apiAmount}`,
          );
        } else {
          verificationDetails = { error: 'Maya API returned null' };
        }
      } catch (error) {
        verificationDetails = { error: (error as Error).message };
        this.logger.error(`Maya API error for ${order.orderNumber}: ${(error as Error).message}`);
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

    // Process the payment
    this.logger.log(
      `Admin ${force ? 'force-' : ''}processing payment for order ${order.orderNumber}`,
    );

    // Update payment status
    const paidAt = new Date();
    const updatedRow = await this.adminRepository.updatePaymentStatus({
      orderId,
      status: 'paid',
      mayaPaymentId: successWebhook?.mayaPaymentId ?? null,
      paidAt,
      orderStatus: 'processing',
      updatedAt: paidAt,
    });

    // Trigger image composition
    try {
      await this.ordersService.composeAndStoreImage(orderId);
      this.logger.log(`Image composed for order ${order.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to compose image for ${order.orderNumber}: ${(error as Error).message}`,
      );
    }

    // Audit log
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
}

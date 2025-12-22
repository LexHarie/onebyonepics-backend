import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser, type User } from '@buiducnhat/nest-better-auth';
import type { FastifyRequest } from 'fastify';
import { AdminOrdersService } from '../../application/admin-orders.service';
import { AdminGuard } from '../guards/admin.guard';
import { OrderQueryDto } from '../dto/order-query.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { UpdatePaymentStatusDto } from '../dto/update-payment-status.dto';

@Controller('admin/orders')
@UseGuards(AuthGuard, AdminGuard)
export class AdminOrdersController {
  constructor(private readonly adminOrdersService: AdminOrdersService) {}

  @Get()
  async listOrders(@Query() query: OrderQueryDto) {
    return this.adminOrdersService.listOrders({
      status: query.status ? this.adminOrdersService.validateOrderStatus(query.status) : undefined,
      paymentStatus: query.paymentStatus
        ? this.adminOrdersService.validatePaymentStatus(query.paymentStatus)
        : undefined,
      search: query.search,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  async getOrder(@Param('id') id: string) {
    return this.adminOrdersService.getOrder(id);
  }

  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: User,
    @Req() req: FastifyRequest,
  ) {
    const status = this.adminOrdersService.validateOrderStatus(dto.status);
    return this.adminOrdersService.updateOrderStatus(
      id,
      status,
      user.id,
      req.ip || null,
    );
  }

  @Patch(':id/payment')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @CurrentUser() user: User,
    @Req() req: FastifyRequest,
  ) {
    const status = this.adminOrdersService.validatePaymentStatus(dto.status);
    return this.adminOrdersService.updatePaymentStatus(
      id,
      status,
      dto.mayaPaymentId ?? null,
      user.id,
      req.ip || null,
    );
  }

  @Post(':id/resend-email')
  async resendOrderEmail(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Req() req: FastifyRequest,
  ) {
    return this.adminOrdersService.resendOrderEmail(id, user.id, req.ip || null);
  }

  /**
   * Verify payment with Maya API and process the order if verified.
   * Use this for orders stuck in pending state despite having a successful webhook.
   * Optionally force-process without verification (use with caution).
   */
  @Post(':id/verify-and-process')
  async verifyAndProcessPayment(
    @Param('id') id: string,
    @Body() body: { force?: boolean },
    @CurrentUser() user: User,
    @Req() req: FastifyRequest,
  ) {
    return this.adminOrdersService.verifyAndProcessPayment(
      id,
      body.force ?? false,
      user.id,
      req.ip || null,
    );
  }
}

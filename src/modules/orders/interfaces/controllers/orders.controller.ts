import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, type User } from '@buiducnhat/nest-better-auth';
import { OptionalAuthGuard } from '../../../../common/guards/optional-auth.guard';
import { OrdersService } from '../../application/orders.service';
import { MayaService } from '../../../payments/infrastructure/maya.service';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { GuestOrderLookupDto } from '../../dto/guest-lookup.dto';
import { gridConfigs } from '../../../grid-configs/domain/data/grid-configs.data';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly mayaService: MayaService,
  ) {}

  /**
   * Create order and initiate Maya checkout
   */
  @Post()
  @UseGuards(OptionalAuthGuard)
  async createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user?: User,
  ) {
    // Create the order
    const order = await this.ordersService.createOrder(dto, user, dto.sessionId);

    const orderItems = dto.items?.length
      ? dto.items
      : dto.gridConfigId
        ? [
          {
            gridConfigId: dto.gridConfigId,
          },
        ]
        : [];

    let gridConfigName = 'Order';
    if (orderItems.length === 1) {
      const gridConfig = gridConfigs.find((cfg) => cfg.id === orderItems[0].gridConfigId);
      gridConfigName = gridConfig?.name || orderItems[0].gridConfigId;
    } else if (orderItems.length > 1) {
      gridConfigName = `${orderItems.length} items`;
    }

    // Check if Maya is configured
    if (!this.mayaService.isConfigured()) {
      // Return order without checkout URL for testing
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        checkoutUrl: null,
        message: 'Payment gateway not configured. Please contact support.',
      };
    }

    try {
      // Create Maya checkout session
      const checkout = await this.mayaService.createCheckout({
        orderNumber: order.orderNumber,
        orderId: order.id,
        amount: order.totalAmount,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        gridConfigName,
      });

      // Update order with Maya checkout ID
      await this.ordersService.setMayaCheckoutId(order.id, checkout.checkoutId);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        checkoutUrl: checkout.redirectUrl,
      };
    } catch (error) {
      // Log error but still return order info
      console.error('Maya checkout creation failed:', error);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        checkoutUrl: null,
        error: 'Failed to create payment session. Please try again.',
      };
    }
  }

  @Post('guest-lookup')
  async guestOrderLookup(@Body() dto: GuestOrderLookupDto) {
    const order = await this.ordersService.guestLookup(
      dto.orderNumber,
      dto.customerEmail,
    );

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      gridConfigId: order.gridConfigId ?? null,
      deliveryZone: order.deliveryZone,
      productPrice: order.productPrice,
      deliveryFee: order.deliveryFee,
      totalAmount: order.totalAmount,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
    };
  }

  @Get(['number/:orderNumber', 'by-number/:orderNumber'])
  @UseGuards(OptionalAuthGuard)
  async getOrderByNumber(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    const order = await this.ordersService.getOrderByNumber(orderNumber, user, sessionId);

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        gridConfigId: order.gridConfigId,
        deliveryZone: order.deliveryZone,
        productPrice: order.productPrice,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        itemCount: order.itemCount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        downloadCount: order.downloadCount,
        maxDownloads: order.maxDownloads,
        composedImageKey: order.composedImageKey,
        items: order.items?.map((item) => ({
          id: item.id,
          gridConfigId: item.gridConfigId,
          generationJobId: item.generationJobId,
          tileAssignments: item.tileAssignments,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          composedImageKey: item.composedImageKey,
        })),
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        isDigitalOnly: order.isDigitalOnly,
      };
  }

  @Get(':id')
  @UseGuards(OptionalAuthGuard)
  async getOrder(
    @Param('id') id: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    const order = await this.ordersService.getOrder(id, user, sessionId);

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        gridConfigId: order.gridConfigId,
        deliveryZone: order.deliveryZone,
        productPrice: order.productPrice,
        deliveryFee: order.deliveryFee,
        totalAmount: order.totalAmount,
        itemCount: order.itemCount,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        downloadCount: order.downloadCount,
        maxDownloads: order.maxDownloads,
        composedImageKey: order.composedImageKey,
        items: order.items?.map((item) => ({
          id: item.id,
          gridConfigId: item.gridConfigId,
          generationJobId: item.generationJobId,
          tileAssignments: item.tileAssignments,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          composedImageKey: item.composedImageKey,
        })),
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        isDigitalOnly: order.isDigitalOnly,
      };
  }

  @Get(':id/items')
  @UseGuards(OptionalAuthGuard)
  async getOrderItems(
    @Param('id') id: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    const order = await this.ordersService.getOrder(id, user, sessionId);
    return order.items ?? [];
  }

  @Get(':id/download')
  @UseGuards(OptionalAuthGuard)
  async getDownloadUrl(
    @Param('id') id: string,
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.ordersService.getDownloadUrl(id, user, sessionId, itemId);
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  async getOrders(
    @CurrentUser() user?: User,
    @Query('sessionId') sessionId?: string,
  ) {
    const orders = await this.ordersService.getOrders(user, sessionId);

    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      gridConfigId: order.gridConfigId,
      totalAmount: order.totalAmount,
      itemCount: order.itemCount,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      createdAt: order.createdAt,
      isDigitalOnly: order.isDigitalOnly,
    }));
  }
}

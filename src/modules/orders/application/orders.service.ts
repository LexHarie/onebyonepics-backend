import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { User } from '@buiducnhat/nest-better-auth';
import { StorageService } from '../../storage/infrastructure/storage.service';
import { GenerationService } from '../../generation/application/generation.service';
import { CompositionService } from '../../composition/application/composition.service';
import { gridConfigs } from '../../grid-configs/domain/data/grid-configs.data';
import {
  rowToOrder,
  type Order,
  type PaymentStatus,
  type OrderStatus,
  type DeliveryZone,
} from '../domain/entities/order.entity';
import { rowToOrderItem, type OrderItemRow } from '../domain/entities/order-item.entity';
import { CreateOrderDto } from '../dto/create-order.dto';
import { rowToGeneratedImage } from '../../generation/domain/entities/generated-image.entity';
import {
  IOrdersRepositoryToken,
  type IOrdersRepository,
} from '../domain/orders.repository.interface';

// Delivery fees in centavos
const DELIVERY_FEES: Record<DeliveryZone, number> = {
  'cebu-city': 5000, // 50 PHP
  'outside-cebu': 10000, // 100 PHP
  'digital-only': 0,
};

// Temporary digital-only discount (applied to base product price)
const DIGITAL_ONLY_DISCOUNT = 0.7;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(IOrdersRepositoryToken)
    private readonly ordersRepository: IOrdersRepository,
    private readonly storageService: StorageService,
    private readonly generationService: GenerationService,
    private readonly compositionService: CompositionService,
  ) {}

  /**
   * Generate a unique order number
   */
  private generateOrderNumber(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = randomBytes(3).toString('hex').toUpperCase();
    return `OBP-${dateStr}-${random}`;
  }

  private normalizeTileAssignments(
    assignments: Record<number, number> | string | null | undefined,
  ): Record<number, number> {
    if (!assignments) return {};
    const raw = typeof assignments === 'string'
      ? (() => {
        try {
          return JSON.parse(assignments) as Record<string, unknown>;
        } catch (error) {
          this.logger.warn(`Failed to parse tile assignments: ${(error as Error).message}`);
          return null;
        }
      })()
      : assignments;

    if (!raw || typeof raw !== 'object') {
      return {};
    }

    const normalized: Record<number, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      const numericValue =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number(value)
            : NaN;
      if (Number.isFinite(numericValue)) {
        normalized[Number(key)] = numericValue;
      }
    }
    return normalized;
  }

  private async composeOrderItem(params: {
    orderId: string;
    orderNumber: string;
    item: OrderItemRow;
  }): Promise<string | null> {
    if (params.item.composed_image_key) {
      return params.item.composed_image_key;
    }

    if (!params.item.generation_job_id) {
      this.logger.warn(`Order item ${params.item.id} has no generation job`);
      return null;
    }

    const imageRows = await this.ordersRepository.findGeneratedImagesByJobId(
      params.item.generation_job_id,
      false,
    );

    if (imageRows.length === 0) {
      this.logger.warn(
        `No unwatermarked images found for job ${params.item.generation_job_id}, using preview images`,
      );
      const previewRows = await this.ordersRepository.findGeneratedImagesByJobId(
        params.item.generation_job_id,
        true,
      );

      if (previewRows.length === 0) {
        this.logger.warn(
          `No generated images found for job ${params.item.generation_job_id}`,
        );
        return null;
      }

      imageRows.push(...previewRows);
    }

    const images = imageRows.map(rowToGeneratedImage);
    const imageKeys = images.map((img) => img.storageKey);
    const tileAssignments = this.normalizeTileAssignments(params.item.tile_assignments);

    if (Object.keys(tileAssignments).length === 0) {
      this.logger.warn(`Order item ${params.item.id} has no tile assignments`);
      return null;
    }

    const composedBuffer = await this.compositionService.composeGrid({
      gridConfigId: params.item.grid_config_id,
      tileAssignments,
      imageKeys,
    });

    const composedKey = `orders/${params.orderId}/items/${params.item.id}/composed-${params.orderNumber}.jpg`;
    await this.storageService.uploadObject(composedKey, composedBuffer, 'image/jpeg');

    this.logger.log(`Stored composed image: ${composedKey} (${composedBuffer.length} bytes)`);

    await this.ordersRepository.setOrderItemComposedKey(params.item.id, composedKey, new Date());
    await this.markImagesPermanent(params.item.generation_job_id);

    return composedKey;
  }

  /**
   * Create a new order
   */
  async createOrder(
    dto: CreateOrderDto,
    user?: User | null,
    sessionId?: string,
  ): Promise<Order> {
    const itemsInput = dto.items?.length
      ? dto.items
      : dto.gridConfigId && dto.generationJobId && dto.tileAssignments
        ? [
          {
            gridConfigId: dto.gridConfigId,
            generationJobId: dto.generationJobId,
            tileAssignments: dto.tileAssignments,
            quantity: 1,
          },
        ]
        : [];

    if (itemsInput.length === 0) {
      throw new BadRequestException('Order must include at least one item');
    }

    const orderNumber = this.generateOrderNumber();
    const userId = user?.id ?? null;
    const effectiveSessionId = sessionId || dto.sessionId || null;

    const isDigitalOnly = Boolean(dto.isDigitalOnly);

    const deliveryZone = isDigitalOnly ? ('digital-only' as DeliveryZone) : dto.deliveryZone;
    const deliveryFee = DELIVERY_FEES[deliveryZone];

    const gridConfigMap = new Map(gridConfigs.map((config) => [config.id, config]));

    const normalizedItems: Array<{
      gridConfigId: string;
      generationJobId: string;
      tileAssignments: Record<number, number>;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }> = [];
    for (const item of itemsInput) {
      const gridConfig = gridConfigMap.get(item.gridConfigId);
      if (!gridConfig) {
        throw new BadRequestException('Invalid grid configuration');
      }

      await this.generationService.assertJobReadyForOrder(
        item.generationJobId,
        user,
        effectiveSessionId ?? undefined,
      );

      const baseProductPrice = Math.round((gridConfig.price || 0) * 100);
      const unitPrice = isDigitalOnly
        ? Math.max(1, Math.round(baseProductPrice * DIGITAL_ONLY_DISCOUNT))
        : baseProductPrice;
      const quantity = Math.max(1, item.quantity);
      const lineTotal = unitPrice * quantity;

      normalizedItems.push({
        gridConfigId: item.gridConfigId,
        generationJobId: item.generationJobId,
        tileAssignments: item.tileAssignments,
        quantity,
        unitPrice,
        lineTotal,
      });
    }

    const productPrice = normalizedItems.reduce((total, item) => total + item.lineTotal, 0);
    const totalAmount = productPrice + deliveryFee;
    const itemCount = normalizedItems.reduce((total, item) => total + item.quantity, 0);
    const legacyItem = normalizedItems.length === 1 ? normalizedItems[0] : null;

    // Provide fallback address values for digital-only orders (DB columns are NOT NULL)
    const streetAddress = isDigitalOnly ? 'Digital delivery' : dto.streetAddress;
    const barangay = isDigitalOnly ? 'Digital' : dto.barangay;
    const city = isDigitalOnly ? 'Digital' : dto.city;
    const province = isDigitalOnly ? 'Digital' : dto.province;
    const postalCode = isDigitalOnly ? '0000' : dto.postalCode;

    const row = await this.ordersRepository.insertOrder({
      orderNumber,
      userId,
      sessionId: effectiveSessionId,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      streetAddress,
      barangay,
      city,
      province,
      postalCode,
      deliveryZone,
      gridConfigId: legacyItem?.gridConfigId ?? null,
      generationJobId: legacyItem?.generationJobId ?? null,
      tileAssignments: legacyItem?.tileAssignments ?? null,
      productPrice,
      deliveryFee,
      totalAmount,
      itemCount,
    });

    const itemRows = await this.ordersRepository.insertOrderItems(
      row.id,
      normalizedItems.map((item) => ({
        gridConfigId: item.gridConfigId,
        generationJobId: item.generationJobId,
        tileAssignments: item.tileAssignments,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
    );

    return {
      ...rowToOrder(row),
      items: itemRows.map(rowToOrderItem),
    };
  }

  /**
   * Find order by ID
   */
  async findById(orderId: string): Promise<Order | null> {
    const row = await this.ordersRepository.findById(orderId);
    return row ? rowToOrder(row) : null;
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const row = await this.ordersRepository.findByOrderNumber(orderNumber);
    return row ? rowToOrder(row) : null;
  }

  /**
   * Find order by Maya checkout ID
   */
  async findByMayaCheckoutId(checkoutId: string): Promise<Order | null> {
    const row = await this.ordersRepository.findByMayaCheckoutId(checkoutId);
    return row ? rowToOrder(row) : null;
  }

  /**
   * Check if user/session can access order
   */
  private canAccess(order: Order, user?: User | null, sessionId?: string): boolean {
    if (user && order.userId === user.id) return true;
    if (!order.userId && sessionId && order.sessionId === sessionId) return true;
    if (sessionId && order.sessionId && order.sessionId === sessionId) return true;
    return false;
  }

  private async attachItems(order: Order): Promise<Order> {
    const itemRows = await this.ordersRepository.findOrderItemsByOrderId(order.id);
    if (itemRows.length === 0) return order;
    return { ...order, items: itemRows.map(rowToOrderItem) };
  }

  /**
   * Get order with access check
   */
  async getOrder(
    orderId: string,
    user?: User | null,
    sessionId?: string,
  ): Promise<Order> {
    const order = await this.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!this.canAccess(order, user, sessionId)) {
      throw new ForbiddenException('Access denied');
    }

    return this.attachItems(order);
  }

  /**
   * Get order by order number with access check
   */
  async getOrderByNumber(
    orderNumber: string,
    user?: User | null,
    sessionId?: string,
  ): Promise<Order> {
    const order = await this.findByOrderNumber(orderNumber);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!this.canAccess(order, user, sessionId)) {
      throw new ForbiddenException('Access denied');
    }

    return this.attachItems(order);
  }

  /**
   * Guest lookup by order number + email (printed orders only)
   */
  async guestLookup(orderNumber: string, customerEmail: string): Promise<Order> {
    const row = await this.ordersRepository.findByOrderNumberAndEmail(
      orderNumber,
      customerEmail.toLowerCase(),
    );

    if (!row) {
      throw new NotFoundException(
        'Order not found. Please verify your order number and email address.',
      );
    }

    const order = rowToOrder(row);

    if (order.isDigitalOnly) {
      throw new ForbiddenException(
        'Digital orders require account login. Please sign in to access your order.',
      );
    }

    return order;
  }

  /**
   * Update Maya checkout ID
   */
  async setMayaCheckoutId(orderId: string, checkoutId: string): Promise<Order> {
    const row = await this.ordersRepository.updateMayaCheckoutId(
      orderId,
      checkoutId,
      new Date(),
    );

    if (!row) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(row);
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    orderId: string,
    status: PaymentStatus,
    mayaPaymentId?: string,
  ): Promise<Order> {
    const now = new Date();
    const paidAt = status === 'paid' ? now : null;
    const orderStatus = status === 'paid' ? 'processing' : 'pending';

    const row = await this.ordersRepository.updatePaymentStatus({
      orderId,
      status,
      mayaPaymentId: mayaPaymentId ?? null,
      paidAt,
      orderStatus,
      updatedAt: now,
    });

    if (!row) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(row);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const row = await this.ordersRepository.updateOrderStatus(
      orderId,
      status,
      new Date(),
    );

    if (!row) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(row);
  }

  /**
   * Set composed image key after server-side composition
   */
  async setComposedImageKey(orderId: string, key: string): Promise<Order> {
    const row = await this.ordersRepository.setComposedImageKey(
      orderId,
      key,
      new Date(),
    );

    if (!row) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(row);
  }

  /**
   * Get download URL for paid order
   */
  async getDownloadUrl(
    orderId: string,
    user?: User | null,
    sessionId?: string,
    itemId?: string,
  ): Promise<{ url: string; expiresIn: number; downloadsRemaining: number }> {
    const order = await this.getOrder(orderId, user, sessionId);

    if (order.paymentStatus !== 'paid') {
      throw new ForbiddenException('Order has not been paid');
    }

    let composedImageKey = order.composedImageKey ?? null;

    if (itemId) {
      const item = order.items?.find((orderItem) => orderItem.id === itemId);
      if (!item) {
        throw new NotFoundException('Order item not found');
      }
      composedImageKey = item.composedImageKey;
    } else if (!composedImageKey && order.items?.length === 1) {
      composedImageKey = order.items[0].composedImageKey;
    }

    if (!composedImageKey) {
      await this.composeAndStoreImage(orderId);
      const refreshed = await this.getOrder(orderId, user, sessionId);
      composedImageKey = refreshed.composedImageKey ?? null;

      if (itemId) {
        const refreshedItem = refreshed.items?.find((orderItem) => orderItem.id === itemId);
        if (!refreshedItem) {
          throw new NotFoundException('Order item not found');
        }
        composedImageKey = refreshedItem.composedImageKey;
      } else if (!composedImageKey && refreshed.items?.length === 1) {
        composedImageKey = refreshed.items[0].composedImageKey;
      }
    }

    if (!composedImageKey) {
      throw new BadRequestException('Composed image not yet available');
    }

    if (order.downloadCount >= order.maxDownloads) {
      throw new ForbiddenException('Download limit reached');
    }

    // Increment download count
    await this.ordersRepository.incrementDownloadCount(orderId, new Date());

    const nextDownloadCount = order.downloadCount + 1;

    // Generate signed URL (valid for 1 hour)
    const expiresIn = 3600;
    const filename = itemId
      ? `onebyonepics-${order.orderNumber}-${itemId}.jpg`
      : `onebyonepics-${order.orderNumber}.jpg`;
    const url = await this.storageService.getSignedUrl(
      composedImageKey,
      expiresIn,
      filename,
    );

    return {
      url,
      expiresIn,
      downloadsRemaining: Math.max(0, order.maxDownloads - nextDownloadCount),
    };
  }

  /**
   * Mark generated images as permanent after payment
   */
  async markImagesPermanent(generationJobId: string): Promise<void> {
    await this.ordersRepository.markGeneratedImagesPermanent(
      generationJobId,
      new Date(),
    );
  }

  async composeForGenerationJob(generationJobId: string): Promise<void> {
    const orderIds = await this.ordersRepository.findPaidOrderIdsByGenerationJobId(
      generationJobId,
    );

    if (orderIds.length === 0) {
      return;
    }

    for (const orderId of orderIds) {
      try {
        await this.composeAndStoreImage(orderId);
      } catch (error) {
        this.logger.warn(
          `Failed to compose order ${orderId} after generation ${generationJobId}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Get orders for a user or session
   */
  async getOrders(user?: User | null, sessionId?: string): Promise<Order[]> {
    if (!user && !sessionId) {
      throw new BadRequestException('User or session required');
    }

    if (user) {
      const rows = await this.ordersRepository.findOrdersByUserId(user.id);
      return rows.map(rowToOrder);
    } else {
      const rows = await this.ordersRepository.findOrdersBySessionId(sessionId as string);
      return rows.map(rowToOrder);
    }
  }

  /**
   * Compose and store the final 4R image after payment
   * Uses unwatermarked source images
   */
  async composeAndStoreImage(orderId: string): Promise<Order> {
    const order = await this.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const itemRows = await this.ordersRepository.findOrderItemsByOrderId(orderId);

    if (itemRows.length === 0) {
      if (!order.generationJobId || !order.gridConfigId || !order.tileAssignments) {
        throw new BadRequestException('Order has no generation job');
      }

      this.logger.log(`Composing image for order ${order.orderNumber}`);

      const imageRows = await this.ordersRepository.findGeneratedImagesByJobId(
        order.generationJobId,
        false,
      );

      if (imageRows.length === 0) {
        this.logger.warn(`No unwatermarked images found for job ${order.generationJobId}, using preview images`);
        const previewRows = await this.ordersRepository.findGeneratedImagesByJobId(
          order.generationJobId,
          true,
        );

        if (previewRows.length === 0) {
          throw new BadRequestException('No generated images found');
        }

        imageRows.push(...previewRows);
      }

      const images = imageRows.map(rowToGeneratedImage);
      const imageKeys = images.map((img) => img.storageKey);

      const tileAssignments = this.normalizeTileAssignments(order.tileAssignments);

      if (Object.keys(tileAssignments).length === 0) {
        throw new BadRequestException('Order has no tile assignments');
      }

      const composedBuffer = await this.compositionService.composeGrid({
        gridConfigId: order.gridConfigId,
        tileAssignments,
        imageKeys,
      });

      const composedKey = `orders/${order.id}/composed-${order.orderNumber}.jpg`;
      await this.storageService.uploadObject(composedKey, composedBuffer, 'image/jpeg');

      this.logger.log(`Stored composed image: ${composedKey} (${composedBuffer.length} bytes)`);

      const updatedOrder = await this.setComposedImageKey(orderId, composedKey);

      await this.markImagesPermanent(order.generationJobId);

      return updatedOrder;
    }

    this.logger.log(`Composing ${itemRows.length} item images for order ${order.orderNumber}`);

    for (const item of itemRows) {
      try {
        await this.composeOrderItem({
          orderId: order.id,
          orderNumber: order.orderNumber,
          item,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to compose item ${item.id} for order ${order.orderNumber}: ${(error as Error).message}`,
        );
      }
    }

    return this.attachItems(order);
  }
}

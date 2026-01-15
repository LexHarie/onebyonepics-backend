import { randomBytes } from 'crypto';
import type { AuthUser } from '../../guards/auth.guard';
import { httpError } from '../../lib/http-error';
import { StorageService } from '../storage/storage.service';
import { GenerationService } from '../generation/generation.service';
import { CompositionService } from '../composition/composition.service';
import { gridConfigs } from '../grid-configs/domain/data/grid-configs.data';
import {
  rowToOrder,
  type Order,
  type PaymentStatus,
  type OrderStatus,
  type DeliveryZone,
} from './domain/entities/order.entity';
import { rowToOrderItem, type OrderItemRow } from './domain/entities/order-item.entity';
import { rowToGeneratedImage } from '../generation/domain/entities/generated-image.entity';
import type { IOrdersRepository } from './domain/orders.repository.interface';
import { AppLogger } from '../../lib/logger';

export type CreateOrderInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  streetAddress: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  deliveryZone: DeliveryZone;
  gridConfigId?: string | null;
  generationJobId?: string | null;
  tileAssignments?: Record<number, number> | null;
  items?: Array<{
    gridConfigId: string;
    generationJobId: string;
    tileAssignments: Record<number, number>;
    quantity: number;
  }>;
  isDigitalOnly?: boolean;
  sessionId?: string | null;
};

const DELIVERY_FEES: Record<DeliveryZone, number> = {
  'cebu-city': 5000,
  'outside-cebu': 10000,
  'digital-only': 0,
};

const DIGITAL_ONLY_DISCOUNT = 0.7;

export class OrdersService {
  private readonly logger = new AppLogger('OrdersService');
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly storageService: StorageService,
    private readonly generationService: GenerationService,
    private readonly compositionService: CompositionService,
  ) {}

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
    const raw =
      typeof assignments === 'string'
        ? (() => {
            try {
              return JSON.parse(assignments) as Record<string, unknown>;
            } catch {
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
      return null;
    }

    const imageRows = await this.ordersRepository.findGeneratedImagesByJobId(
      params.item.generation_job_id,
      false,
    );

    if (imageRows.length === 0) {
      const previewRows = await this.ordersRepository.findGeneratedImagesByJobId(
        params.item.generation_job_id,
        true,
      );

      if (previewRows.length === 0) {
        return null;
      }

      imageRows.push(...previewRows);
    }

    const images = imageRows.map(rowToGeneratedImage);
    const imageKeys = images.map((img) => img.storageKey);
    const tileAssignments = this.normalizeTileAssignments(
      params.item.tile_assignments,
    );

    if (Object.keys(tileAssignments).length === 0) {
      return null;
    }

    const composedBuffer = await this.compositionService.composeGrid({
      gridConfigId: params.item.grid_config_id,
      tileAssignments,
      imageKeys,
    });

    const composedKey = `orders/${params.orderId}/items/${params.item.id}/composed-${params.orderNumber}.jpg`;
    await this.storageService.uploadObject(
      composedKey,
      composedBuffer,
      'image/jpeg',
    );

    await this.ordersRepository.setOrderItemComposedKey(
      params.item.id,
      composedKey,
      new Date(),
    );
    await this.markImagesPermanent(params.item.generation_job_id);

    return composedKey;
  }

  async createOrder(
    dto: CreateOrderInput,
    user?: AuthUser | null,
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
      throw httpError(400, 'Order must include at least one item');
    }

    const orderNumber = this.generateOrderNumber();
    const userId = user?.id ?? null;
    const effectiveSessionId = sessionId || dto.sessionId || null;
    const isDigitalOnly = Boolean(dto.isDigitalOnly);

    const deliveryZone = isDigitalOnly
      ? ('digital-only' as DeliveryZone)
      : dto.deliveryZone;
    const deliveryFee = DELIVERY_FEES[deliveryZone];

    const gridConfigMap = new Map(
      gridConfigs.map((config) => [config.id, config]),
    );

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
        throw httpError(400, 'Invalid grid configuration');
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

    const productPrice = normalizedItems.reduce(
      (total, item) => total + item.lineTotal,
      0,
    );
    const totalAmount = productPrice + deliveryFee;
    const itemCount = normalizedItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    const legacyItem = normalizedItems.length === 1 ? normalizedItems[0] : null;

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

  async findById(orderId: string): Promise<Order | null> {
    const row = await this.ordersRepository.findById(orderId);
    return row ? rowToOrder(row) : null;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const row = await this.ordersRepository.findByOrderNumber(orderNumber);
    return row ? rowToOrder(row) : null;
  }

  async findByPayMongoCheckoutId(checkoutId: string): Promise<Order | null> {
    const row = await this.ordersRepository.findByPayMongoCheckoutId(checkoutId);
    return row ? rowToOrder(row) : null;
  }

  private canAccess(order: Order, user?: AuthUser | null, sessionId?: string): boolean {
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

  async getOrder(
    orderId: string,
    user?: AuthUser | null,
    sessionId?: string,
  ): Promise<Order> {
    const order = await this.findById(orderId);
    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (!this.canAccess(order, user, sessionId)) {
      throw httpError(403, 'Access denied');
    }

    return this.attachItems(order);
  }

  async getOrderByNumber(
    orderNumber: string,
    user?: AuthUser | null,
    sessionId?: string,
  ): Promise<Order> {
    const order = await this.findByOrderNumber(orderNumber);
    if (!order) {
      throw httpError(404, 'Order not found');
    }

    if (!this.canAccess(order, user, sessionId)) {
      throw httpError(403, 'Access denied');
    }

    return this.attachItems(order);
  }

  async guestLookup(orderNumber: string, customerEmail: string): Promise<Order> {
    const row = await this.ordersRepository.findByOrderNumberAndEmail(
      orderNumber,
      customerEmail.toLowerCase(),
    );

    if (!row) {
      throw httpError(
        404,
        'Order not found. Please verify your order number and email address.',
      );
    }

    const order = rowToOrder(row);

    if (order.isDigitalOnly) {
      throw httpError(
        403,
        'Digital orders require account login. Please sign in to access your order.',
      );
    }

    return order;
  }

  async setPayMongoCheckoutId(orderId: string, checkoutId: string): Promise<Order> {
    const row = await this.ordersRepository.updatePayMongoCheckoutId(
      orderId,
      checkoutId,
      new Date(),
    );

    if (!row) {
      throw httpError(404, 'Order not found');
    }

    return rowToOrder(row);
  }

  async updatePaymentStatus(
    orderId: string,
    status: PaymentStatus,
    paymongoPaymentId?: string,
  ): Promise<Order> {
    const now = new Date();
    const paidAt = status === 'paid' ? now : null;
    const orderStatus = status === 'paid' ? 'processing' : 'pending';

    const row = await this.ordersRepository.updatePaymentStatus({
      orderId,
      status,
      paymongoPaymentId: paymongoPaymentId ?? null,
      paidAt,
      orderStatus,
      updatedAt: now,
    });

    if (!row) {
      throw httpError(404, 'Order not found');
    }

    return rowToOrder(row);
  }

  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const row = await this.ordersRepository.updateOrderStatus(
      orderId,
      status,
      new Date(),
    );

    if (!row) {
      throw httpError(404, 'Order not found');
    }

    return rowToOrder(row);
  }

  async setComposedImageKey(orderId: string, key: string): Promise<Order> {
    const row = await this.ordersRepository.setComposedImageKey(
      orderId,
      key,
      new Date(),
    );

    if (!row) {
      throw httpError(404, 'Order not found');
    }

    return rowToOrder(row);
  }

  async getDownloadUrl(
    orderId: string,
    user?: AuthUser | null,
    sessionId?: string,
    itemId?: string,
  ): Promise<{ url: string; expiresIn: number; downloadsRemaining: number }> {
    const order = await this.getOrder(orderId, user, sessionId);

    if (order.paymentStatus !== 'paid') {
      throw httpError(403, 'Order has not been paid');
    }

    let composedImageKey = order.composedImageKey ?? null;

    if (itemId) {
      const item = order.items?.find((orderItem) => orderItem.id === itemId);
      if (!item) {
        throw httpError(404, 'Order item not found');
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
        const refreshedItem = refreshed.items?.find(
          (orderItem) => orderItem.id === itemId,
        );
        if (!refreshedItem) {
          throw httpError(404, 'Order item not found');
        }
        composedImageKey = refreshedItem.composedImageKey;
      } else if (!composedImageKey && refreshed.items?.length === 1) {
        composedImageKey = refreshed.items[0].composedImageKey;
      }
    }

    if (!composedImageKey) {
      throw httpError(400, 'Composed image not yet available');
    }

    if (order.downloadCount >= order.maxDownloads) {
      throw httpError(403, 'Download limit reached');
    }

    await this.ordersRepository.incrementDownloadCount(orderId, new Date());

    const nextDownloadCount = order.downloadCount + 1;

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

  async getOrders(user?: AuthUser | null, sessionId?: string): Promise<Order[]> {
    if (!user && !sessionId) {
      throw httpError(400, 'User or session required');
    }

    if (user) {
      const rows = await this.ordersRepository.findOrdersByUserId(user.id);
      return rows.map(rowToOrder);
    }

    const rows = await this.ordersRepository.findOrdersBySessionId(
      sessionId as string,
    );
    return rows.map(rowToOrder);
  }

  async composeAndStoreImage(orderId: string): Promise<Order> {
    const order = await this.findById(orderId);
    if (!order) {
      throw httpError(404, 'Order not found');
    }

    const itemRows = await this.ordersRepository.findOrderItemsByOrderId(orderId);

    if (itemRows.length === 0) {
      if (!order.generationJobId || !order.gridConfigId || !order.tileAssignments) {
        throw httpError(400, 'Order has no generation job');
      }

      const imageRows = await this.ordersRepository.findGeneratedImagesByJobId(
        order.generationJobId,
        false,
      );

      if (imageRows.length === 0) {
        const previewRows = await this.ordersRepository.findGeneratedImagesByJobId(
          order.generationJobId,
          true,
        );

        if (previewRows.length === 0) {
          throw httpError(400, 'No generated images found');
        }

        imageRows.push(...previewRows);
      }

      const images = imageRows.map(rowToGeneratedImage);
      const imageKeys = images.map((img) => img.storageKey);

      const tileAssignments = this.normalizeTileAssignments(order.tileAssignments);

      if (Object.keys(tileAssignments).length === 0) {
        throw httpError(400, 'Order has no tile assignments');
      }

      const composedBuffer = await this.compositionService.composeGrid({
        gridConfigId: order.gridConfigId,
        tileAssignments,
        imageKeys,
      });

      const composedKey = `orders/${order.id}/composed-${order.orderNumber}.jpg`;
      await this.storageService.uploadObject(
        composedKey,
        composedBuffer,
        'image/jpeg',
      );

      const updatedOrder = await this.setComposedImageKey(orderId, composedKey);
      await this.markImagesPermanent(order.generationJobId);

      return updatedOrder;
    }

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

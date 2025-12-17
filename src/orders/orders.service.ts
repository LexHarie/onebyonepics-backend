import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { GenerationService } from '../generation/generation.service';
import { CompositionService } from '../composition/composition.service';
import { gridConfigs } from '../grid-configs/data/grid-configs.data';
import {
  Order,
  OrderRow,
  PaymentStatus,
  OrderStatus,
  DeliveryZone,
  rowToOrder,
} from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import type { User } from '../users/entities/user.entity';
import { GeneratedImageRow, rowToGeneratedImage } from '../generation/entities/generated-image.entity';

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
    private readonly db: DatabaseService,
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

  /**
   * Create a new order
   */
  async createOrder(
    dto: CreateOrderDto,
    user?: User | null,
    sessionId?: string,
  ): Promise<Order> {
    // Validate grid config exists
    const gridConfig = gridConfigs.find((cfg) => cfg.id === dto.gridConfigId);
    if (!gridConfig) {
      throw new BadRequestException('Invalid grid configuration');
    }

    // Verify generation job exists and user has access
    await this.generationService.getResult(
      dto.generationJobId,
      user,
      sessionId || dto.sessionId,
      false,
    );

    const orderNumber = this.generateOrderNumber();
    const userId = user?.id ?? null;
    const effectiveSessionId = sessionId || dto.sessionId || null;

    const isDigitalOnly = Boolean(dto.isDigitalOnly);

    // Calculate pricing (in centavos)
    const baseProductPrice = Math.round((gridConfig.price || 0) * 100);
    const productPrice = isDigitalOnly
      ? Math.max(1, Math.round(baseProductPrice * DIGITAL_ONLY_DISCOUNT))
      : baseProductPrice;
    const deliveryZone = isDigitalOnly ? ('digital-only' as DeliveryZone) : dto.deliveryZone;
    const deliveryFee = DELIVERY_FEES[deliveryZone];
    const totalAmount = productPrice + deliveryFee;

    // Provide fallback address values for digital-only orders (DB columns are NOT NULL)
    const streetAddress = isDigitalOnly ? 'Digital delivery' : dto.streetAddress;
    const barangay = isDigitalOnly ? 'Digital' : dto.barangay;
    const city = isDigitalOnly ? 'Digital' : dto.city;
    const province = isDigitalOnly ? 'Digital' : dto.province;
    const postalCode = isDigitalOnly ? '0000' : dto.postalCode;

    const rows = await this.db.sql<OrderRow[]>`
      INSERT INTO orders (
        order_number, user_id, session_id,
        customer_name, customer_email, customer_phone,
        street_address, barangay, city, province, postal_code, delivery_zone,
        grid_config_id, generation_job_id, tile_assignments,
        product_price, delivery_fee, total_amount,
        payment_status, order_status
      )
      VALUES (
        ${orderNumber}, ${userId}, ${effectiveSessionId},
        ${dto.customerName}, ${dto.customerEmail}, ${dto.customerPhone},
        ${streetAddress}, ${barangay}, ${city}, ${province}, ${postalCode}, ${deliveryZone},
        ${dto.gridConfigId}, ${dto.generationJobId}, ${JSON.stringify(dto.tileAssignments)},
        ${productPrice}, ${deliveryFee}, ${totalAmount},
        'pending', 'pending'
      )
      RETURNING *
    `;

    return rowToOrder(rows[0]);
  }

  /**
   * Find order by ID
   */
  async findById(orderId: string): Promise<Order | null> {
    const rows = await this.db.sql<OrderRow[]>`
      SELECT * FROM orders WHERE id = ${orderId} LIMIT 1
    `;
    return rows.length > 0 ? rowToOrder(rows[0]) : null;
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string): Promise<Order | null> {
    const rows = await this.db.sql<OrderRow[]>`
      SELECT * FROM orders WHERE order_number = ${orderNumber} LIMIT 1
    `;
    return rows.length > 0 ? rowToOrder(rows[0]) : null;
  }

  /**
   * Find order by Maya checkout ID
   */
  async findByMayaCheckoutId(checkoutId: string): Promise<Order | null> {
    const rows = await this.db.sql<OrderRow[]>`
      SELECT * FROM orders WHERE maya_checkout_id = ${checkoutId} LIMIT 1
    `;
    return rows.length > 0 ? rowToOrder(rows[0]) : null;
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

    return order;
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

    return order;
  }

  /**
   * Update Maya checkout ID
   */
  async setMayaCheckoutId(orderId: string, checkoutId: string): Promise<Order> {
    const rows = await this.db.sql<OrderRow[]>`
      UPDATE orders
      SET maya_checkout_id = ${checkoutId}, updated_at = ${new Date()}
      WHERE id = ${orderId}
      RETURNING *
    `;

    if (rows.length === 0) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(rows[0]);
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    orderId: string,
    status: PaymentStatus,
    mayaPaymentId?: string,
  ): Promise<Order> {
    const updates: Record<string, unknown> = {
      payment_status: status,
      updated_at: new Date(),
    };

    if (mayaPaymentId) {
      updates.maya_payment_id = mayaPaymentId;
    }

    if (status === 'paid') {
      updates.paid_at = new Date();
      updates.order_status = 'processing';
    }

    const rows = await this.db.sql<OrderRow[]>`
      UPDATE orders
      SET
        payment_status = ${status},
        maya_payment_id = ${mayaPaymentId ?? null},
        paid_at = ${status === 'paid' ? new Date() : null},
        order_status = ${status === 'paid' ? 'processing' : 'pending'},
        updated_at = ${new Date()}
      WHERE id = ${orderId}
      RETURNING *
    `;

    if (rows.length === 0) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(rows[0]);
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const timestampField =
      status === 'shipped' ? 'shipped_at' :
      status === 'delivered' ? 'delivered_at' : null;

    let rows: OrderRow[];

    if (timestampField === 'shipped_at') {
      rows = await this.db.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, shipped_at = ${new Date()}, updated_at = ${new Date()}
        WHERE id = ${orderId}
        RETURNING *
      `;
    } else if (timestampField === 'delivered_at') {
      rows = await this.db.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, delivered_at = ${new Date()}, updated_at = ${new Date()}
        WHERE id = ${orderId}
        RETURNING *
      `;
    } else {
      rows = await this.db.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, updated_at = ${new Date()}
        WHERE id = ${orderId}
        RETURNING *
      `;
    }

    if (rows.length === 0) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(rows[0]);
  }

  /**
   * Set composed image key after server-side composition
   */
  async setComposedImageKey(orderId: string, key: string): Promise<Order> {
    const rows = await this.db.sql<OrderRow[]>`
      UPDATE orders
      SET composed_image_key = ${key}, updated_at = ${new Date()}
      WHERE id = ${orderId}
      RETURNING *
    `;

    if (rows.length === 0) {
      throw new NotFoundException('Order not found');
    }

    return rowToOrder(rows[0]);
  }

  /**
   * Get download URL for paid order
   */
  async getDownloadUrl(
    orderId: string,
    user?: User | null,
    sessionId?: string,
  ): Promise<{ url: string; expiresIn: number; downloadsRemaining: number }> {
    const order = await this.getOrder(orderId, user, sessionId);

    if (order.paymentStatus !== 'paid') {
      throw new ForbiddenException('Order has not been paid');
    }

    if (!order.composedImageKey) {
      throw new BadRequestException('Composed image not yet available');
    }

    if (order.downloadCount >= order.maxDownloads) {
      throw new ForbiddenException('Download limit reached');
    }

    // Increment download count
    await this.db.sql`
      UPDATE orders
      SET download_count = download_count + 1, updated_at = ${new Date()}
      WHERE id = ${orderId}
    `;

    const nextDownloadCount = order.downloadCount + 1;

    // Generate signed URL (valid for 1 hour)
    const expiresIn = 3600;
    const filename = `onebyonepics-${order.orderNumber}.jpg`;
    const url = await this.storageService.getSignedUrl(
      order.composedImageKey,
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
    await this.db.sql`
      UPDATE generated_images
      SET is_permanent = true, expires_at = NULL, updated_at = ${new Date()}
      WHERE generation_job_id = ${generationJobId}
    `;
  }

  /**
   * Get orders for a user or session
   */
  async getOrders(user?: User | null, sessionId?: string): Promise<Order[]> {
    if (!user && !sessionId) {
      throw new BadRequestException('User or session required');
    }

    let rows: OrderRow[];

    if (user) {
      rows = await this.db.sql<OrderRow[]>`
        SELECT * FROM orders
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
      `;
    } else {
      rows = await this.db.sql<OrderRow[]>`
        SELECT * FROM orders
        WHERE session_id = ${sessionId}
        ORDER BY created_at DESC
      `;
    }

    return rows.map(rowToOrder);
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

    if (!order.generationJobId) {
      throw new BadRequestException('Order has no generation job');
    }

    this.logger.log(`Composing image for order ${order.orderNumber}`);

    // Get unwatermarked generated images (is_preview = false)
    const imageRows = await this.db.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images
      WHERE generation_job_id = ${order.generationJobId}
        AND is_preview = false
      ORDER BY variation_index ASC
    `;

    if (imageRows.length === 0) {
      // Fallback to preview images if unwatermarked not available
      this.logger.warn(`No unwatermarked images found for job ${order.generationJobId}, using preview images`);
      const previewRows = await this.db.sql<GeneratedImageRow[]>`
        SELECT * FROM generated_images
        WHERE generation_job_id = ${order.generationJobId}
          AND is_preview = true
        ORDER BY variation_index ASC
      `;

      if (previewRows.length === 0) {
        throw new BadRequestException('No generated images found');
      }

      imageRows.push(...previewRows);
    }

    const images = imageRows.map(rowToGeneratedImage);
    const imageKeys = images.map((img) => img.storageKey);

    // Parse tile assignments
    const tileAssignments = order.tileAssignments as Record<number, number>;

    // Compose the grid
    const composedBuffer = await this.compositionService.composeGrid({
      gridConfigId: order.gridConfigId,
      tileAssignments,
      imageKeys,
    });

    // Store composed image
    const composedKey = `orders/${order.id}/composed-${order.orderNumber}.jpg`;
    await this.storageService.uploadObject(composedKey, composedBuffer, 'image/jpeg');

    this.logger.log(`Stored composed image: ${composedKey} (${composedBuffer.length} bytes)`);

    // Update order with composed image key
    const updatedOrder = await this.setComposedImageKey(orderId, composedKey);

    // Mark generated images as permanent
    await this.markImagesPermanent(order.generationJobId);

    return updatedOrder;
  }
}

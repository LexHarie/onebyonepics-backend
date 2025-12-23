import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../../database/infrastructure/database.service';
import type {
  OrderRow,
  OrderStatus,
  PaymentStatus,
} from '../../../domain/entities/order.entity';
import type { OrderItemRow } from '../../../domain/entities/order-item.entity';
import type { GeneratedImageRow } from '../../../../generation/domain/entities/generated-image.entity';
import type {
  CreateOrderItemInput,
  IOrdersRepository,
} from '../../../domain/orders.repository.interface';

@Injectable()
export class OrdersRepository implements IOrdersRepository {
  constructor(private readonly db: DatabaseService) {}

  async insertOrder(params: {
    orderNumber: string;
    userId: string | null;
    sessionId: string | null;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    streetAddress: string;
    barangay: string;
    city: string;
    province: string;
    postalCode: string;
    deliveryZone: string;
    gridConfigId: string | null;
    generationJobId: string | null;
    tileAssignments: Record<number, number> | null;
    productPrice: number;
    deliveryFee: number;
    totalAmount: number;
    itemCount: number;
  }): Promise<OrderRow> {
    const tileAssignmentsJson = params.tileAssignments
      ? JSON.stringify(params.tileAssignments)
      : null;

    const rows = await this.db.sql<OrderRow[]>`
      INSERT INTO orders (
        order_number, user_id, session_id,
        customer_name, customer_email, customer_phone,
        street_address, barangay, city, province, postal_code, delivery_zone,
        grid_config_id, generation_job_id, tile_assignments,
        product_price, delivery_fee, total_amount, item_count,
        payment_status, order_status
      )
      VALUES (
        ${params.orderNumber}, ${params.userId}, ${params.sessionId},
        ${params.customerName}, ${params.customerEmail}, ${params.customerPhone},
        ${params.streetAddress}, ${params.barangay}, ${params.city}, ${params.province},
        ${params.postalCode}, ${params.deliveryZone},
        ${params.gridConfigId}, ${params.generationJobId},
        ${tileAssignmentsJson},
        ${params.productPrice}, ${params.deliveryFee}, ${params.totalAmount},
        ${params.itemCount},
        'pending', 'pending'
      )
      RETURNING *
    `;

    return rows[0];
  }

  async insertOrderItems(
    orderId: string,
    items: CreateOrderItemInput[],
  ): Promise<OrderItemRow[]> {
    const rows: OrderItemRow[] = [];

    for (const item of items) {
      const result = await this.db.sql<OrderItemRow[]>`
        INSERT INTO order_items (
          order_id,
          grid_config_id,
          generation_job_id,
          tile_assignments,
          quantity,
          unit_price,
          line_total,
          composed_image_key
        )
        VALUES (
          ${orderId},
          ${item.gridConfigId},
          ${item.generationJobId},
          ${JSON.stringify(item.tileAssignments)},
          ${item.quantity},
          ${item.unitPrice},
          ${item.lineTotal},
          ${item.composedImageKey ?? null}
        )
        RETURNING *
      `;
      if (result[0]) {
        rows.push(result[0]);
      }
    }

    return rows;
  }

  async findOrderItemsByOrderId(orderId: string): Promise<OrderItemRow[]> {
    return this.db.sql<OrderItemRow[]>`
      SELECT * FROM order_items
      WHERE order_id = ${orderId}
      ORDER BY created_at ASC
    `;
  }

  async setOrderItemComposedKey(
    itemId: string,
    key: string,
    updatedAt: Date,
  ): Promise<void> {
    await this.db.sql`
      UPDATE order_items
      SET composed_image_key = ${key}, updated_at = ${updatedAt}
      WHERE id = ${itemId}
    `;
  }

  async findById(orderId: string): Promise<OrderRow | null> {
    const rows = await this.db.sql<OrderRow[]>`
      SELECT * FROM orders WHERE id = ${orderId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderRow | null> {
    const rows = await this.db.sql<OrderRow[]>`
      SELECT * FROM orders WHERE order_number = ${orderNumber} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findByOrderNumberAndEmail(
    orderNumber: string,
    customerEmail: string,
  ): Promise<OrderRow | null> {
    const rows = await this.db.sql<OrderRow[]>`
      SELECT * FROM orders
      WHERE order_number = ${orderNumber}
        AND LOWER(customer_email) = LOWER(${customerEmail})
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async findByMayaCheckoutId(checkoutId: string): Promise<OrderRow | null> {
    const rows = await this.db.sql<OrderRow[]>`
      SELECT * FROM orders WHERE maya_checkout_id = ${checkoutId} LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async updateMayaCheckoutId(
    orderId: string,
    checkoutId: string,
    updatedAt: Date,
  ): Promise<OrderRow | null> {
    const rows = await this.db.sql<OrderRow[]>`
      UPDATE orders
      SET maya_checkout_id = ${checkoutId}, updated_at = ${updatedAt}
      WHERE id = ${orderId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async updatePaymentStatus(params: {
    orderId: string;
    status: PaymentStatus;
    mayaPaymentId: string | null;
    paidAt: Date | null;
    orderStatus: OrderStatus;
    updatedAt: Date;
  }): Promise<OrderRow | null> {
    const rows = await this.db.sql<OrderRow[]>`
      UPDATE orders
      SET
        payment_status = ${params.status},
        maya_payment_id = ${params.mayaPaymentId},
        paid_at = ${params.paidAt},
        order_status = ${params.orderStatus},
        updated_at = ${params.updatedAt}
      WHERE id = ${params.orderId}
      RETURNING *
    `;

    return rows[0] ?? null;
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    updatedAt: Date,
  ): Promise<OrderRow | null> {
    let rows: OrderRow[];

    if (status === 'shipped') {
      rows = await this.db.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, shipped_at = ${updatedAt}, updated_at = ${updatedAt}
        WHERE id = ${orderId}
        RETURNING *
      `;
    } else if (status === 'delivered') {
      rows = await this.db.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, delivered_at = ${updatedAt}, updated_at = ${updatedAt}
        WHERE id = ${orderId}
        RETURNING *
      `;
    } else {
      rows = await this.db.sql<OrderRow[]>`
        UPDATE orders
        SET order_status = ${status}, updated_at = ${updatedAt}
        WHERE id = ${orderId}
        RETURNING *
      `;
    }

    return rows[0] ?? null;
  }

  async setComposedImageKey(
    orderId: string,
    key: string,
    updatedAt: Date,
  ): Promise<OrderRow | null> {
    const rows = await this.db.sql<OrderRow[]>`
      UPDATE orders
      SET composed_image_key = ${key}, updated_at = ${updatedAt}
      WHERE id = ${orderId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async incrementDownloadCount(orderId: string, updatedAt: Date): Promise<void> {
    await this.db.sql`
      UPDATE orders
      SET download_count = download_count + 1, updated_at = ${updatedAt}
      WHERE id = ${orderId}
    `;
  }

  async markGeneratedImagesPermanent(generationJobId: string, updatedAt: Date): Promise<void> {
    await this.db.sql`
      UPDATE generated_images
      SET is_permanent = true, expires_at = NULL, updated_at = ${updatedAt}
      WHERE generation_job_id = ${generationJobId}
    `;
  }

  async findOrdersByUserId(userId: string): Promise<OrderRow[]> {
    return this.db.sql<OrderRow[]>`
      SELECT * FROM orders
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
  }

  async findOrdersBySessionId(sessionId: string): Promise<OrderRow[]> {
    return this.db.sql<OrderRow[]>`
      SELECT * FROM orders
      WHERE session_id = ${sessionId}
      ORDER BY created_at DESC
    `;
  }

  async findGeneratedImagesByJobId(
    generationJobId: string,
    isPreview: boolean,
  ): Promise<GeneratedImageRow[]> {
    return this.db.sql<GeneratedImageRow[]>`
      SELECT * FROM generated_images
      WHERE generation_job_id = ${generationJobId}
        AND is_preview = ${isPreview}
      ORDER BY variation_index ASC
    `;
  }
}

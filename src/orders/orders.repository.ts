import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { OrderRow, OrderStatus, PaymentStatus } from './entities/order.entity';
import { GeneratedImageRow } from '../generation/entities/generated-image.entity';
import { IOrdersRepository } from './orders.repository.interface';

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
    gridConfigId: string;
    generationJobId: string | null;
    tileAssignments: Record<number, number>;
    productPrice: number;
    deliveryFee: number;
    totalAmount: number;
  }): Promise<OrderRow> {
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
        ${params.orderNumber}, ${params.userId}, ${params.sessionId},
        ${params.customerName}, ${params.customerEmail}, ${params.customerPhone},
        ${params.streetAddress}, ${params.barangay}, ${params.city}, ${params.province},
        ${params.postalCode}, ${params.deliveryZone},
        ${params.gridConfigId}, ${params.generationJobId},
        ${JSON.stringify(params.tileAssignments)},
        ${params.productPrice}, ${params.deliveryFee}, ${params.totalAmount},
        'pending', 'pending'
      )
      RETURNING *
    `;

    return rows[0];
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

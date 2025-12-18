import { OrderRow, OrderStatus, PaymentStatus } from './entities/order.entity';
import { GeneratedImageRow } from '../../generation/domain/entities/generated-image.entity';

export interface IOrdersRepository {
  insertOrder(params: {
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
  }): Promise<OrderRow>;
  findById(orderId: string): Promise<OrderRow | null>;
  findByOrderNumber(orderNumber: string): Promise<OrderRow | null>;
  findByMayaCheckoutId(checkoutId: string): Promise<OrderRow | null>;
  updateMayaCheckoutId(
    orderId: string,
    checkoutId: string,
    updatedAt: Date,
  ): Promise<OrderRow | null>;
  updatePaymentStatus(params: {
    orderId: string;
    status: PaymentStatus;
    mayaPaymentId: string | null;
    paidAt: Date | null;
    orderStatus: OrderStatus;
    updatedAt: Date;
  }): Promise<OrderRow | null>;
  updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    updatedAt: Date,
  ): Promise<OrderRow | null>;
  setComposedImageKey(
    orderId: string,
    key: string,
    updatedAt: Date,
  ): Promise<OrderRow | null>;
  incrementDownloadCount(orderId: string, updatedAt: Date): Promise<void>;
  markGeneratedImagesPermanent(generationJobId: string, updatedAt: Date): Promise<void>;
  findOrdersByUserId(userId: string): Promise<OrderRow[]>;
  findOrdersBySessionId(sessionId: string): Promise<OrderRow[]>;
  findGeneratedImagesByJobId(
    generationJobId: string,
    isPreview: boolean,
  ): Promise<GeneratedImageRow[]>;
}

export const IOrdersRepositoryToken = Symbol('IOrdersRepository');

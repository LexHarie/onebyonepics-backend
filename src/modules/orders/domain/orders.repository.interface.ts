import type {
  OrderRow,
  OrderStatus,
  PaymentStatus,
} from './entities/order.entity';
import type { OrderItemRow } from './entities/order-item.entity';
import type { GeneratedImageRow } from '../../generation/domain/entities/generated-image.entity';

export interface CreateOrderItemInput {
  gridConfigId: string;
  generationJobId: string | null;
  tileAssignments: Record<number, number>;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  composedImageKey?: string | null;
}

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
    gridConfigId: string | null;
    generationJobId: string | null;
    tileAssignments: Record<number, number> | null;
    productPrice: number;
    deliveryFee: number;
    totalAmount: number;
    itemCount: number;
    paymentMethod?: string;
    orderStatus?: string;
  }): Promise<OrderRow>;
  insertOrderItems(
    orderId: string,
    items: CreateOrderItemInput[],
  ): Promise<OrderItemRow[]>;
  findOrderItemsByOrderId(orderId: string): Promise<OrderItemRow[]>;
  setOrderItemComposedKey(itemId: string, key: string, updatedAt: Date): Promise<void>;
  findById(orderId: string): Promise<OrderRow | null>;
  findByOrderNumber(orderNumber: string): Promise<OrderRow | null>;
  findByOrderNumberAndEmail(
    orderNumber: string,
    customerEmail: string,
  ): Promise<OrderRow | null>;
  findByPayMongoCheckoutId(checkoutId: string): Promise<OrderRow | null>;
  updatePayMongoCheckoutId(
    orderId: string,
    checkoutId: string,
    updatedAt: Date,
  ): Promise<OrderRow | null>;
  updatePaymentStatus(params: {
    orderId: string;
    status: PaymentStatus;
    paymongoPaymentId: string | null;
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
  findPaidOrderIdsByGenerationJobId(generationJobId: string): Promise<string[]>;
}

export const IOrdersRepositoryToken = Symbol('IOrdersRepository');

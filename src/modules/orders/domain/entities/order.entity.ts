export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type DeliveryZone = 'cebu-city' | 'outside-cebu' | 'digital-only';

import type { OrderItem } from './order-item.entity';

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string | null;
  sessionId?: string | null;

  // Customer info
  customerName: string;
  customerEmail: string;
  customerPhone: string;

  // Address
  streetAddress: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  deliveryZone: DeliveryZone;

  // Product info
  gridConfigId?: string | null;
  generationJobId?: string | null;
  tileAssignments?: Record<number, number>;
  itemCount: number;
  items?: OrderItem[];

  // Pricing (in centavos)
  productPrice: number;
  deliveryFee: number;
  totalAmount: number;

  // Status
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;

  // Maya payment
  mayaCheckoutId?: string | null;
  mayaPaymentId?: string | null;

  // Digital delivery
  composedImageKey?: string | null;
  downloadCount: number;
  maxDownloads: number;

  // Timestamps
  paidAt?: Date | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  isDigitalOnly?: boolean;
}

export interface OrderRow {
  id: string;
  order_number: string;
  user_id: string | null;
  session_id: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  street_address: string;
  barangay: string;
  city: string;
  province: string;
  postal_code: string;
  delivery_zone: string;
  grid_config_id: string | null;
  generation_job_id: string | null;
  tile_assignments: Record<number, number> | null;
  product_price: number;
  delivery_fee: number;
  total_amount: number;
  item_count: number;
  payment_status: string;
  order_status: string;
  maya_checkout_id: string | null;
  maya_payment_id: string | null;
  composed_image_key: string | null;
  download_count: number;
  max_downloads: number;
  paid_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    sessionId: row.session_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    streetAddress: row.street_address,
    barangay: row.barangay,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    deliveryZone: row.delivery_zone as DeliveryZone,
    gridConfigId: row.grid_config_id ?? undefined,
    generationJobId: row.generation_job_id ?? undefined,
    tileAssignments: row.tile_assignments ?? undefined,
    itemCount: row.item_count ?? 1,
    productPrice: row.product_price,
    deliveryFee: row.delivery_fee,
    totalAmount: row.total_amount,
    paymentStatus: row.payment_status as PaymentStatus,
    orderStatus: row.order_status as OrderStatus,
    mayaCheckoutId: row.maya_checkout_id,
    mayaPaymentId: row.maya_payment_id,
    composedImageKey: row.composed_image_key,
    downloadCount: row.download_count,
    maxDownloads: row.max_downloads,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDigitalOnly: row.delivery_zone === 'digital-only',
  };
}

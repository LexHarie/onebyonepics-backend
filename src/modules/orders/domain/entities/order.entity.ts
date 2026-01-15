export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type DeliveryZone = 'cebu-city' | 'outside-cebu' | 'digital-only';
export type PaymentProvider = 'paymongo';

import type { OrderItem } from './order-item.entity';

function normalizeTileAssignments(
  assignments: Record<number, number> | string | null,
): Record<number, number> | undefined {
  if (!assignments) return undefined;
  const raw = typeof assignments === 'string'
    ? (() => {
      try {
        return JSON.parse(assignments) as Record<string, unknown>;
      } catch {
        return null;
      }
    })()
    : assignments;
  if (!raw || typeof raw !== 'object') return undefined;
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
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

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

  // Payment provider
  paymentProvider: PaymentProvider;
  paymongoCheckoutId?: string | null;
  paymongoPaymentId?: string | null;

  // Digital delivery
  composedImageKey?: string | null;
  downloadCount: number;
  maxDownloads: number;

  // Admin workflow
  adminDownloadedAt?: Date | null;
  adminDownloadedBy?: string | null;
  adminPrintedAt?: Date | null;
  adminPrintedBy?: string | null;

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
  tile_assignments: Record<number, number> | string | null;
  product_price: number;
  delivery_fee: number;
  total_amount: number;
  item_count: number;
  payment_status: string;
  order_status: string;
  payment_provider: string | null;
  paymongo_checkout_id: string | null;
  paymongo_payment_id: string | null;
  composed_image_key: string | null;
  download_count: number;
  max_downloads: number;
  admin_downloaded_at: Date | null;
  admin_downloaded_by: string | null;
  admin_printed_at: Date | null;
  admin_printed_by: string | null;
  paid_at: Date | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function rowToOrder(row: OrderRow): Order {
  const normalizedAssignments = normalizeTileAssignments(row.tile_assignments);
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
    tileAssignments: normalizedAssignments,
    itemCount: row.item_count ?? 1,
    productPrice: row.product_price,
    deliveryFee: row.delivery_fee,
    totalAmount: row.total_amount,
    paymentStatus: row.payment_status as PaymentStatus,
    orderStatus: row.order_status as OrderStatus,
    paymentProvider: (row.payment_provider as PaymentProvider) ?? 'paymongo',
    paymongoCheckoutId: row.paymongo_checkout_id,
    paymongoPaymentId: row.paymongo_payment_id,
    composedImageKey: row.composed_image_key,
    downloadCount: row.download_count,
    maxDownloads: row.max_downloads,
    adminDownloadedAt: row.admin_downloaded_at,
    adminDownloadedBy: row.admin_downloaded_by,
    adminPrintedAt: row.admin_printed_at,
    adminPrintedBy: row.admin_printed_by,
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDigitalOnly: row.delivery_zone === 'digital-only',
  };
}

export type PayMongoPaymentStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export type PayMongoWebhookEventType =
  | 'checkout_session.payment.paid'
  | 'payment.paid'
  | 'payment.failed'
  | 'payment.refunded';

export interface PayMongoPayment {
  id: string;
  type: 'payment';
  attributes: {
    amount: number;
    billing: {
      name: string;
      email: string;
      phone: string;
    } | null;
    currency: string;
    description: string | null;
    fee: number;
    net_amount: number;
    status: PayMongoPaymentStatus;
    source: {
      id: string;
      type: string;
    };
    created_at: number;
    paid_at: number | null;
  };
}

export interface PayMongoCheckoutSessionData {
  id: string;
  type: 'checkout_session';
  attributes: {
    billing: {
      name: string;
      email: string;
      phone: string;
    } | null;
    checkout_url: string;
    client_key: string;
    description: string | null;
    line_items: Array<{
      name: string;
      quantity: number;
      amount: number;
      currency: string;
    }>;
    livemode: boolean;
    merchant: string;
    metadata: Record<string, string> | null;
    payments: PayMongoPayment[];
    reference_number: string;
    send_email_receipt: boolean;
    status: 'active' | 'expired' | 'paid';
    success_url: string;
    cancel_url: string;
    created_at: number;
    updated_at: number;
  };
}

export interface PayMongoWebhookPayload {
  data: {
    id: string;
    type: 'event';
    attributes: {
      type: PayMongoWebhookEventType;
      livemode: boolean;
      data: PayMongoCheckoutSessionData;
      created_at: number;
      updated_at: number;
    };
  };
}

export function isCheckoutPaymentPaid(payload: PayMongoWebhookPayload): boolean {
  return payload.data.attributes.type === 'checkout_session.payment.paid';
}

export function extractReferenceNumber(payload: PayMongoWebhookPayload): string | null {
  return payload.data.attributes.data.attributes.reference_number ?? null;
}

export function extractPaymentId(payload: PayMongoWebhookPayload): string | null {
  const payments = payload.data.attributes.data.attributes.payments;
  return payments?.[0]?.id ?? null;
}

export function extractPaymentStatus(
  payload: PayMongoWebhookPayload,
): PayMongoPaymentStatus {
  const payments = payload.data.attributes.data.attributes.payments;
  return payments?.[0]?.attributes.status ?? 'pending';
}

export function extractPaymentAmount(payload: PayMongoWebhookPayload): number {
  const payments = payload.data.attributes.data.attributes.payments;
  return payments?.[0]?.attributes.amount ?? 0;
}

import type { MayaPaymentStatus, MayaFundSourceType } from './maya-webhook.types';

/**
 * Domain entity for webhook events
 */
export interface WebhookEvent {
  id: string;
  eventType: string;
  mayaPaymentId: string | null;
  orderNumber: string | null;
  paymentStatus: MayaPaymentStatus | null;
  fundSourceType: MayaFundSourceType | null;
  rawPayload: Record<string, unknown>;
  processed: boolean;
  processingError: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

/**
 * Database row format (snake_case)
 */
export interface WebhookEventRow {
  id: string;
  event_type: string;
  maya_payment_id: string | null;
  order_number: string | null;
  payment_status: string | null;
  fund_source_type: string | null;
  raw_payload: Record<string, unknown>;
  processed: boolean;
  processing_error: string | null;
  created_at: Date;
  processed_at: Date | null;
}

/**
 * Convert database row to domain entity
 */
export function rowToWebhookEvent(row: WebhookEventRow): WebhookEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    mayaPaymentId: row.maya_payment_id,
    orderNumber: row.order_number,
    paymentStatus: row.payment_status as MayaPaymentStatus | null,
    fundSourceType: row.fund_source_type as MayaFundSourceType | null,
    rawPayload: row.raw_payload,
    processed: row.processed,
    processingError: row.processing_error,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  };
}

/**
 * Parameters for creating a new webhook event
 */
export interface CreateWebhookEventParams {
  eventType: string;
  mayaPaymentId: string;
  orderNumber: string;
  paymentStatus: string | null;
  fundSourceType: string | null;
  rawPayload: Record<string, unknown>;
}

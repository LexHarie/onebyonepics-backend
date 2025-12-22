import type { MayaPaymentStatus, MayaFundSourceType } from './maya-webhook.types';

/**
 * Verification status for webhook events
 */
export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'skipped';

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
  // Verification fields
  verified: boolean;
  verificationStatus: VerificationStatus;
  verificationError: string | null;
  verificationAttemptedAt: Date | null;
  verifiedAmount: number | null;
  verifiedPaymentStatus: MayaPaymentStatus | null;
  verificationAttempts: number;
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
  // Verification fields
  verified: boolean;
  verification_status: string;
  verification_error: string | null;
  verification_attempted_at: Date | null;
  verified_amount: number | null;
  verified_payment_status: string | null;
  verification_attempts: number;
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
    // Verification fields
    verified: row.verified ?? false,
    verificationStatus: (row.verification_status as VerificationStatus) ?? 'pending',
    verificationError: row.verification_error,
    verificationAttemptedAt: row.verification_attempted_at,
    verifiedAmount: row.verified_amount,
    verifiedPaymentStatus: row.verified_payment_status as MayaPaymentStatus | null,
    verificationAttempts: row.verification_attempts ?? 0,
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

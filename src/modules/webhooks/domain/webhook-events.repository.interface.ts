import type {
  WebhookEvent,
  CreateWebhookEventParams,
} from './entities/webhook-event.entity';

export interface IWebhookEventsRepository {
  /**
   * Create a new webhook event record
   */
  create(params: CreateWebhookEventParams): Promise<WebhookEvent>;

  /**
   * Find webhook events by order number
   */
  findByOrderNumber(orderNumber: string): Promise<WebhookEvent[]>;

  /**
   * Find webhook event by PayMongo payment ID
   */
  findByPayMongoPaymentId(paymentId: string): Promise<WebhookEvent | null>;

  /**
   * Find webhook event by ID
   */
  findById(id: string): Promise<WebhookEvent | null>;

  /**
   * Mark webhook event as processed
   */
  markProcessed(id: string, error?: string): Promise<void>;

  /**
   * Find unprocessed webhook events (for retry)
   */
  findUnprocessed(limit?: number): Promise<WebhookEvent[]>;

  /**
   * Mark webhook as verified with provider API data
   */
  markVerified(
    id: string,
    verifiedAmount: number,
    verifiedPaymentStatus: string,
  ): Promise<void>;

  /**
   * Mark webhook verification as failed
   */
  markVerificationFailed(id: string, error: string): Promise<void>;

  /**
   * Mark webhook verification as skipped (for non-success statuses)
   */
  markVerificationSkipped(id: string, reason: string): Promise<void>;

  /**
   * Find pending verification webhooks (for retry job)
   * Only returns webhooks with less than maxAttempts
   */
  findPendingVerification(limit?: number, maxAttempts?: number): Promise<WebhookEvent[]>;

  /**
   * Increment verification attempts counter
   */
  incrementVerificationAttempts(id: string): Promise<void>;
}

export const IWebhookEventsRepositoryToken = Symbol('IWebhookEventsRepository');

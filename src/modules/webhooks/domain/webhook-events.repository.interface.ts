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
   * Find webhook event by Maya payment ID
   */
  findByMayaPaymentId(mayaPaymentId: string): Promise<WebhookEvent | null>;

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
}

export const IWebhookEventsRepositoryToken = Symbol('IWebhookEventsRepository');

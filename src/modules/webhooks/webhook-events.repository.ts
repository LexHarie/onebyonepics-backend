import type { SQL } from 'bun';
import { getSql } from '../../lib/database';
import type { IWebhookEventsRepository } from './domain/webhook-events.repository.interface';
import {
  type WebhookEvent,
  type WebhookEventRow,
  type CreateWebhookEventParams,
  rowToWebhookEvent,
} from './domain/entities/webhook-event.entity';

export class WebhookEventsRepository implements IWebhookEventsRepository {
  constructor(private readonly sql: SQL) {}

  async create(params: CreateWebhookEventParams): Promise<WebhookEvent> {
    const rows = await this.sql<WebhookEventRow[]>`
      INSERT INTO webhook_events (
        event_type,
        maya_payment_id,
        order_number,
        payment_status,
        fund_source_type,
        raw_payload
      ) VALUES (
        ${params.eventType},
        ${params.mayaPaymentId},
        ${params.orderNumber},
        ${params.paymentStatus},
        ${params.fundSourceType},
        ${JSON.stringify(params.rawPayload)}::jsonb
      )
      RETURNING *
    `;
    return rowToWebhookEvent(rows[0]);
  }

  async findByOrderNumber(orderNumber: string): Promise<WebhookEvent[]> {
    const rows = await this.sql<WebhookEventRow[]>`
      SELECT * FROM webhook_events
      WHERE order_number = ${orderNumber}
      ORDER BY created_at DESC
    `;
    return rows.map(rowToWebhookEvent);
  }

  async findByMayaPaymentId(mayaPaymentId: string): Promise<WebhookEvent | null> {
    const rows = await this.sql<WebhookEventRow[]>`
      SELECT * FROM webhook_events
      WHERE maya_payment_id = ${mayaPaymentId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ? rowToWebhookEvent(rows[0]) : null;
  }

  async findById(id: string): Promise<WebhookEvent | null> {
    const rows = await this.sql<WebhookEventRow[]>`
      SELECT * FROM webhook_events
      WHERE id = ${id}
    `;
    return rows[0] ? rowToWebhookEvent(rows[0]) : null;
  }

  async markProcessed(id: string, error?: string): Promise<void> {
    await this.sql`
      UPDATE webhook_events
      SET
        processed = TRUE,
        processed_at = NOW(),
        processing_error = ${error || null}
      WHERE id = ${id}
    `;
  }

  async findUnprocessed(limit = 100): Promise<WebhookEvent[]> {
    const rows = await this.sql<WebhookEventRow[]>`
      SELECT * FROM webhook_events
      WHERE processed = FALSE
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows.map(rowToWebhookEvent);
  }

  async markVerified(
    id: string,
    verifiedAmount: number,
    verifiedPaymentStatus: string,
  ): Promise<void> {
    await this.sql`
      UPDATE webhook_events
      SET
        verified = TRUE,
        verification_status = 'verified',
        verification_attempted_at = NOW(),
        verified_amount = ${verifiedAmount},
        verified_payment_status = ${verifiedPaymentStatus}
      WHERE id = ${id}
    `;
  }

  async markVerificationFailed(id: string, error: string): Promise<void> {
    await this.sql`
      UPDATE webhook_events
      SET
        verification_status = 'failed',
        verification_error = ${error},
        verification_attempted_at = NOW()
      WHERE id = ${id}
    `;
  }

  async markVerificationSkipped(id: string, reason: string): Promise<void> {
    await this.sql`
      UPDATE webhook_events
      SET
        verified = TRUE,
        verification_status = 'skipped',
        verification_error = ${reason},
        verification_attempted_at = NOW()
      WHERE id = ${id}
    `;
  }

  async findPendingVerification(
    limit = 50,
    maxAttempts = 5,
  ): Promise<WebhookEvent[]> {
    const rows = await this.sql<WebhookEventRow[]>`
      SELECT * FROM webhook_events
      WHERE verification_status IN ('pending', 'failed')
        AND verification_attempts < ${maxAttempts}
        AND processed = TRUE
        AND created_at > NOW() - INTERVAL '24 hours'
        AND payment_status IN ('PAYMENT_SUCCESS', 'AUTHORIZED')
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows.map(rowToWebhookEvent);
  }

  async incrementVerificationAttempts(id: string): Promise<void> {
    await this.sql`
      UPDATE webhook_events
      SET verification_attempts = verification_attempts + 1
      WHERE id = ${id}
    `;
  }
}

export const createWebhookEventsRepository = () =>
  new WebhookEventsRepository(getSql());

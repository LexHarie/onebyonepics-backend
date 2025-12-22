import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration007AddWebhookEvents: Migration = {
  name: '007_add_webhook_events',

  async up(sql: SQL): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(50) NOT NULL,
        maya_payment_id VARCHAR(255),
        order_number VARCHAR(50),
        payment_status VARCHAR(50),
        fund_source_type VARCHAR(50),
        raw_payload JSONB NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        processing_error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_order_number
      ON webhook_events(order_number)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_maya_payment_id
      ON webhook_events(maya_payment_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
      ON webhook_events(created_at DESC)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_status
      ON webhook_events(payment_status)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_processed
      ON webhook_events(processed) WHERE processed = FALSE
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`DROP TABLE IF EXISTS webhook_events`;
  },
};

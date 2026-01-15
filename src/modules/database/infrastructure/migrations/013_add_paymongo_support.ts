import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration013AddPaymongoSupport: Migration = {
  name: '013_add_paymongo_support',

  async up(sql: SQL): Promise<void> {
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS paymongo_checkout_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS paymongo_payment_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'paymongo'
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_paymongo_checkout_id
      ON orders(paymongo_checkout_id)
      WHERE paymongo_checkout_id IS NOT NULL
    `;

    await sql`
      ALTER TABLE webhook_events
      ADD COLUMN IF NOT EXISTS paymongo_payment_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50) DEFAULT 'paymongo'
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_paymongo_payment_id
      ON webhook_events(paymongo_payment_id)
      WHERE paymongo_payment_id IS NOT NULL
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_orders_paymongo_checkout_id`;
    await sql`DROP INDEX IF EXISTS idx_webhook_events_paymongo_payment_id`;
    await sql`
      ALTER TABLE orders
      DROP COLUMN IF EXISTS paymongo_checkout_id,
      DROP COLUMN IF EXISTS paymongo_payment_id,
      DROP COLUMN IF EXISTS payment_provider
    `;
    await sql`
      ALTER TABLE webhook_events
      DROP COLUMN IF EXISTS paymongo_payment_id,
      DROP COLUMN IF EXISTS payment_provider
    `;
  },
};

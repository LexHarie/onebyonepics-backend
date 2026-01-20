import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration014AddPaymentMethod: Migration = {
  name: '014_add_payment_method',

  async up(sql: SQL): Promise<void> {
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'online'
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`
      ALTER TABLE orders
      DROP COLUMN IF EXISTS payment_method
    `;
  },
};

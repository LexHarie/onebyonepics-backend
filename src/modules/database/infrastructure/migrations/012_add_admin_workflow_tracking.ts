import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration012AddAdminWorkflowTracking: Migration = {
  name: '012_add_admin_workflow_tracking',

  async up(sql: SQL): Promise<void> {
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS admin_downloaded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS admin_downloaded_by UUID,
      ADD COLUMN IF NOT EXISTS admin_printed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS admin_printed_by UUID
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_admin_workflow
      ON orders(admin_downloaded_at, admin_printed_at)
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS idx_orders_admin_workflow
    `;

    await sql`
      ALTER TABLE orders
      DROP COLUMN IF EXISTS admin_downloaded_at,
      DROP COLUMN IF EXISTS admin_downloaded_by,
      DROP COLUMN IF EXISTS admin_printed_at,
      DROP COLUMN IF EXISTS admin_printed_by
    `;
  },
};

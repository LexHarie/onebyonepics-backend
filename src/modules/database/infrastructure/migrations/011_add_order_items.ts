import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration011AddOrderItems: Migration = {
  name: '011_add_order_items',

  async up(sql: SQL): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        grid_config_id VARCHAR(255) NOT NULL,
        generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
        tile_assignments JSONB NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price INTEGER NOT NULL,
        line_total INTEGER NOT NULL,
        composed_image_key VARCHAR(500),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      ALTER TABLE orders
      ALTER COLUMN grid_config_id DROP NOT NULL,
      ALTER COLUMN generation_job_id DROP NOT NULL,
      ALTER COLUMN tile_assignments DROP NOT NULL
    `;

    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS item_count INTEGER DEFAULT 1
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`
      ALTER TABLE orders
      DROP COLUMN IF EXISTS item_count
    `;

    await sql`
      ALTER TABLE orders
      ALTER COLUMN grid_config_id SET NOT NULL,
      ALTER COLUMN generation_job_id SET NOT NULL,
      ALTER COLUMN tile_assignments SET NOT NULL
    `;

    await sql`
      DROP TABLE IF EXISTS order_items
    `;
  },
};

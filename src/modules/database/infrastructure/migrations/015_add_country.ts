import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration015AddCountry: Migration = {
  name: '015_add_country',

  async up(sql: SQL): Promise<void> {
    await sql`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Philippines'
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`
      ALTER TABLE orders
      DROP COLUMN IF EXISTS country
    `;
  },
};

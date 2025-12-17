import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const fixStorageUrl: Migration = {
  name: '002_fix_storage_url',

  async up(sql: SQL): Promise<void> {
    // Make storage_url nullable since the codebase doesn't use this column
    // It was added manually to the database but not through migrations
    await sql`ALTER TABLE uploaded_images ALTER COLUMN storage_url DROP NOT NULL`;
  },

  async down(sql: SQL): Promise<void> {
    await sql`ALTER TABLE uploaded_images ALTER COLUMN storage_url SET NOT NULL`;
  },
};

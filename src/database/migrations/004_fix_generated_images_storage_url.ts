import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const fixGeneratedImagesStorageUrl: Migration = {
  name: '004_fix_generated_images_storage_url',

  async up(sql: SQL): Promise<void> {
    // Make storage_url nullable since the codebase doesn't use this column
    await sql`ALTER TABLE generated_images ALTER COLUMN storage_url DROP NOT NULL`;
  },

  async down(sql: SQL): Promise<void> {
    await sql`ALTER TABLE generated_images ALTER COLUMN storage_url SET NOT NULL`;
  },
};

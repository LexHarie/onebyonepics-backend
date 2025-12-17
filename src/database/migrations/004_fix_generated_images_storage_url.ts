import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const fixGeneratedImagesStorageUrl: Migration = {
  name: '004_fix_generated_images_storage_url',

  async up(sql: SQL): Promise<void> {
    // Make storage_url nullable since the codebase doesn't use this column
    // Skip if column doesn't exist (will be added by migration 005)
    const hasColumn = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generated_images' AND column_name = 'storage_url'
      ) as exists
    `;

    if (hasColumn[0].exists) {
      await sql`ALTER TABLE generated_images ALTER COLUMN storage_url DROP NOT NULL`;
    }
  },

  async down(sql: SQL): Promise<void> {
    await sql`ALTER TABLE generated_images ALTER COLUMN storage_url SET NOT NULL`;
  },
};

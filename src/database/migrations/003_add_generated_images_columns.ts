import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const addGeneratedImagesColumns: Migration = {
  name: '003_add_generated_images_columns',

  async up(sql: SQL): Promise<void> {
    // Add is_permanent column if it doesn't exist
    await sql`
      ALTER TABLE generated_images
      ADD COLUMN IF NOT EXISTS is_permanent BOOLEAN DEFAULT false
    `;

    // Add is_preview column if it doesn't exist
    await sql`
      ALTER TABLE generated_images
      ADD COLUMN IF NOT EXISTS is_preview BOOLEAN DEFAULT true
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`ALTER TABLE generated_images DROP COLUMN IF EXISTS is_permanent`;
    await sql`ALTER TABLE generated_images DROP COLUMN IF EXISTS is_preview`;
  },
};

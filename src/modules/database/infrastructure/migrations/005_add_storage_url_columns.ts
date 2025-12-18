import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const addStorageUrlColumns: Migration = {
  name: '005_add_storage_url_columns',

  async up(sql: SQL): Promise<void> {
    // Add storage_url column to uploaded_images if it doesn't exist
    // This column was manually added to the database but never defined in migrations
    const uploadedImagesHasColumn = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'uploaded_images' AND column_name = 'storage_url'
      ) as exists
    `;

    if (!uploadedImagesHasColumn[0].exists) {
      await sql`ALTER TABLE uploaded_images ADD COLUMN storage_url VARCHAR(500)`;
    }

    // Add storage_url column to generated_images if it doesn't exist
    const generatedImagesHasColumn = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'generated_images' AND column_name = 'storage_url'
      ) as exists
    `;

    if (!generatedImagesHasColumn[0].exists) {
      await sql`ALTER TABLE generated_images ADD COLUMN storage_url VARCHAR(500)`;
    }
  },

  async down(sql: SQL): Promise<void> {
    await sql`ALTER TABLE uploaded_images DROP COLUMN IF EXISTS storage_url`;
    await sql`ALTER TABLE generated_images DROP COLUMN IF EXISTS storage_url`;
  },
};

import type { Migration } from './migration.interface';
import { baseline } from './001_baseline';
import { fixStorageUrl } from './002_fix_storage_url';
import { addGeneratedImagesColumns } from './003_add_generated_images_columns';
import { fixGeneratedImagesStorageUrl } from './004_fix_generated_images_storage_url';
import { addStorageUrlColumns } from './005_add_storage_url_columns';
import { removeLegacyUsersTable } from './006_remove_legacy_users_table';

// Export all migrations in order
// Add new migrations to this array as they are created
export const migrations: Migration[] = [
  baseline,
  fixStorageUrl,
  addGeneratedImagesColumns,
  fixGeneratedImagesStorageUrl,
  addStorageUrlColumns,
  removeLegacyUsersTable,
];

export type { Migration } from './migration.interface';
export { runMigrations, getMigrationStatus } from './migration-runner';

import type { Migration } from './migration.interface';
import { baseline } from './001_baseline';
import { fixStorageUrl } from './002_fix_storage_url';
import { addGeneratedImagesColumns } from './003_add_generated_images_columns';
import { fixGeneratedImagesStorageUrl } from './004_fix_generated_images_storage_url';
import { addStorageUrlColumns } from './005_add_storage_url_columns';
import { removeLegacyUsersTable } from './006_remove_legacy_users_table';
import { migration007AddWebhookEvents } from './007_add_webhook_events';
import { migration008AddWebhookVerification } from './008_add_webhook_verification';
import { migration009AddAdminRole } from './009_add_admin_role';
import { migration010AddDailyStats } from './010_add_daily_stats';
import { migration011AddOrderItems } from './011_add_order_items';
import { migration012AddAdminWorkflowTracking } from './012_add_admin_workflow_tracking';
import { migration013AddPaymongoSupport } from './013_add_paymongo_support';
import { migration014AddPaymentMethod } from './014_add_payment_method';

// Export all migrations in order
// Add new migrations to this array as they are created
export const migrations: Migration[] = [
  baseline,
  fixStorageUrl,
  addGeneratedImagesColumns,
  fixGeneratedImagesStorageUrl,
  addStorageUrlColumns,
  removeLegacyUsersTable,
  migration007AddWebhookEvents,
  migration008AddWebhookVerification,
  migration009AddAdminRole,
  migration010AddDailyStats,
  migration011AddOrderItems,
  migration012AddAdminWorkflowTracking,
  migration013AddPaymongoSupport,
  migration014AddPaymentMethod,
];

export type { Migration } from './migration.interface';
export { runMigrations, getMigrationStatus } from './migration-runner';

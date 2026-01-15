import type { SQL } from 'bun';

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

// Expected schema based on migrations
// Note: Better Auth manages its own tables (user, session, account, verification)
// which are not validated here as they're managed by Better Auth migrations
const expectedSchema: Record<string, string[]> = {
  // Application tables (user_id now references Better Auth's user table with TEXT type)
  uploaded_images: ['id', 'user_id', 'session_id', 'storage_key', 'storage_url', 'mime_type', 'file_size', 'original_filename', 'expires_at', 'created_at'],
  generation_jobs: ['id', 'user_id', 'session_id', 'uploaded_image_id', 'grid_config_id', 'variation_count', 'status', 'error_message', 'started_at', 'completed_at', 'created_at'],
  generated_images: ['id', 'generation_job_id', 'variation_index', 'storage_key', 'storage_url', 'mime_type', 'file_size', 'expires_at', 'is_permanent', 'is_preview', 'created_at', 'updated_at'],
  orders: ['id', 'order_number', 'user_id', 'session_id', 'customer_name', 'customer_email', 'customer_phone', 'street_address', 'barangay', 'city', 'province', 'postal_code', 'delivery_zone', 'grid_config_id', 'generation_job_id', 'tile_assignments', 'product_price', 'delivery_fee', 'total_amount', 'item_count', 'payment_status', 'order_status', 'maya_checkout_id', 'maya_payment_id', 'paymongo_checkout_id', 'paymongo_payment_id', 'payment_provider', 'composed_image_key', 'download_count', 'max_downloads', 'admin_downloaded_at', 'admin_downloaded_by', 'admin_printed_at', 'admin_printed_by', 'paid_at', 'shipped_at', 'delivered_at', 'created_at', 'updated_at'],
  order_items: ['id', 'order_id', 'grid_config_id', 'generation_job_id', 'tile_assignments', 'quantity', 'unit_price', 'line_total', 'composed_image_key', 'created_at', 'updated_at'],
  session_quotas: ['id', 'session_id', 'preview_count', 'max_previews', 'created_at', 'updated_at'],
  webhook_events: ['id', 'event_type', 'maya_payment_id', 'paymongo_payment_id', 'payment_provider', 'order_number', 'payment_status', 'fund_source_type', 'raw_payload', 'processed', 'processing_error', 'created_at', 'processed_at', 'verified', 'verification_status', 'verification_error', 'verification_attempted_at', 'verified_amount', 'verified_payment_status', 'verification_attempts'],
  admin_audit_logs: ['id', 'admin_user_id', 'action', 'target_type', 'target_id', 'metadata', 'ip_address', 'created_at'],
  daily_stats: ['date', 'total_orders', 'paid_orders', 'total_revenue', 'generation_jobs', 'failed_jobs', 'new_users', 'created_at'],
};

export async function validateSchema(sql: SQL): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const [tableName, expectedColumns] of Object.entries(expectedSchema)) {
    // Get actual columns from database
    const actualColumns = await sql<ColumnInfo[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = ${tableName}
      ORDER BY ordinal_position
    `;

    const actualColumnNames = actualColumns.map((c) => c.column_name);

    // Check for missing columns (in expected but not in actual)
    for (const col of expectedColumns) {
      if (!actualColumnNames.includes(col)) {
        errors.push(`Table "${tableName}" is missing column "${col}"`);
      }
    }

    // Check for extra columns (in actual but not in expected)
    for (const col of actualColumnNames) {
      if (!expectedColumns.includes(col)) {
        errors.push(`Table "${tableName}" has unexpected column "${col}" (not in migrations)`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

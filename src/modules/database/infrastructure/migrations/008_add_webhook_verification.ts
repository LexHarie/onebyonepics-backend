import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration008AddWebhookVerification: Migration = {
  name: '008_add_webhook_verification',

  async up(sql: SQL): Promise<void> {
    // Add verification tracking columns to webhook_events
    await sql`
      ALTER TABLE webhook_events
      ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verification_error TEXT,
      ADD COLUMN IF NOT EXISTS verification_attempted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_amount INTEGER,
      ADD COLUMN IF NOT EXISTS verified_payment_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS verification_attempts INTEGER DEFAULT 0
    `;

    // Index for finding pending verifications (used by retry job)
    await sql`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_verification_pending
      ON webhook_events(verification_status, verification_attempts)
      WHERE verification_status = 'pending'
    `;

    // Backfill existing webhook events as skipped (legacy - no verification available)
    await sql`
      UPDATE webhook_events
      SET
        verification_status = 'skipped',
        verified = TRUE,
        verification_error = 'Legacy webhook - verification not available'
      WHERE verification_status = 'pending'
        AND created_at < NOW() - INTERVAL '1 hour'
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`
      DROP INDEX IF EXISTS idx_webhook_events_verification_pending
    `;

    await sql`
      ALTER TABLE webhook_events
      DROP COLUMN IF EXISTS verified,
      DROP COLUMN IF EXISTS verification_status,
      DROP COLUMN IF EXISTS verification_error,
      DROP COLUMN IF EXISTS verification_attempted_at,
      DROP COLUMN IF EXISTS verified_amount,
      DROP COLUMN IF EXISTS verified_payment_status,
      DROP COLUMN IF EXISTS verification_attempts
    `;
  },
};

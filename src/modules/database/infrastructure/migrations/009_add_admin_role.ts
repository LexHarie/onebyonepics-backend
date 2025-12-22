import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration009AddAdminRole: Migration = {
  name: '009_add_admin_role',

  async up(sql: SQL): Promise<void> {
    // Add admin role + moderation fields to Better Auth user table
    await sql`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS "banReason" TEXT,
      ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMPTZ
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_user_role ON "user"(role)
    `;

    // Add admin impersonation tracking to session table
    await sql`
      ALTER TABLE "session"
      ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT
    `;

    // Admin audit log table
    await sql`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user_id TEXT NOT NULL,
        action VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(255),
        metadata JSONB,
        ip_address VARCHAR(45),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS admin_audit_logs
    `;

    await sql`
      DROP INDEX IF EXISTS idx_user_role
    `;

    await sql`
      ALTER TABLE "session"
      DROP COLUMN IF EXISTS "impersonatedBy"
    `;

    await sql`
      ALTER TABLE "user"
      DROP COLUMN IF EXISTS role,
      DROP COLUMN IF EXISTS banned,
      DROP COLUMN IF EXISTS "banReason",
      DROP COLUMN IF EXISTS "banExpires"
    `;
  },
};

import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

/**
 * Migration to remove the legacy `users` and `refresh_tokens` tables.
 *
 * Better Auth provides its own `user`, `session`, and `account` tables.
 * This migration:
 * 1. Updates foreign keys in existing tables to reference the Better Auth `user` table
 * 2. Drops the legacy `refresh_tokens` table (replaced by Better Auth's `session` table)
 * 3. Drops the legacy `users` table (replaced by Better Auth's `user` table)
 */
export const removeLegacyUsersTable: Migration = {
  name: '006_remove_legacy_users_table',

  async up(sql: SQL): Promise<void> {
    // Step 1: Drop foreign key constraints that reference the old users table
    // We need to drop the columns and recreate them with new type (UUID -> TEXT)

    // uploaded_images: drop FK constraint and alter column
    await sql`
      ALTER TABLE uploaded_images
      DROP CONSTRAINT IF EXISTS uploaded_images_user_id_fkey
    `;
    await sql`
      ALTER TABLE uploaded_images
      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT
    `;
    await sql`
      ALTER TABLE uploaded_images
      ADD CONSTRAINT uploaded_images_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL
    `;

    // generation_jobs: drop FK constraint and alter column
    await sql`
      ALTER TABLE generation_jobs
      DROP CONSTRAINT IF EXISTS generation_jobs_user_id_fkey
    `;
    await sql`
      ALTER TABLE generation_jobs
      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT
    `;
    await sql`
      ALTER TABLE generation_jobs
      ADD CONSTRAINT generation_jobs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL
    `;

    // orders: drop FK constraint and alter column
    await sql`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS orders_user_id_fkey
    `;
    await sql`
      ALTER TABLE orders
      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT
    `;
    await sql`
      ALTER TABLE orders
      ADD CONSTRAINT orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE SET NULL
    `;

    // Step 2: Drop the legacy refresh_tokens table (Better Auth uses session table)
    await sql`DROP TABLE IF EXISTS refresh_tokens CASCADE`;

    // Step 3: Drop the legacy users table (Better Auth uses user table)
    await sql`DROP TABLE IF EXISTS users CASCADE`;
  },

  async down(sql: SQL): Promise<void> {
    // Recreate the legacy users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        is_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Recreate the refresh_tokens table
    await sql`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        revoked_at TIMESTAMPTZ
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash)
    `;

    // Revert the foreign key changes (TEXT -> UUID, reference users instead of user)
    // uploaded_images
    await sql`
      ALTER TABLE uploaded_images
      DROP CONSTRAINT IF EXISTS uploaded_images_user_id_fkey
    `;
    await sql`
      ALTER TABLE uploaded_images
      ALTER COLUMN user_id TYPE UUID USING user_id::UUID
    `;
    await sql`
      ALTER TABLE uploaded_images
      ADD CONSTRAINT uploaded_images_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `;

    // generation_jobs
    await sql`
      ALTER TABLE generation_jobs
      DROP CONSTRAINT IF EXISTS generation_jobs_user_id_fkey
    `;
    await sql`
      ALTER TABLE generation_jobs
      ALTER COLUMN user_id TYPE UUID USING user_id::UUID
    `;
    await sql`
      ALTER TABLE generation_jobs
      ADD CONSTRAINT generation_jobs_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `;

    // orders
    await sql`
      ALTER TABLE orders
      DROP CONSTRAINT IF EXISTS orders_user_id_fkey
    `;
    await sql`
      ALTER TABLE orders
      ALTER COLUMN user_id TYPE UUID USING user_id::UUID
    `;
    await sql`
      ALTER TABLE orders
      ADD CONSTRAINT orders_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    `;
  },
};

import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const baseline: Migration = {
  name: '001_baseline',

  async up(sql: SQL): Promise<void> {
    // Users table
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

    // Refresh tokens table
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

    // Uploaded images table
    await sql`
      CREATE TABLE IF NOT EXISTS uploaded_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR(255),
        storage_key VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        file_size INTEGER NOT NULL,
        original_filename VARCHAR(255),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_uploaded_images_session_id ON uploaded_images(session_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_uploaded_images_expires_at ON uploaded_images(expires_at)
    `;

    // Generation jobs table
    await sql`
      CREATE TABLE IF NOT EXISTS generation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR(255),
        uploaded_image_id UUID REFERENCES uploaded_images(id) ON DELETE SET NULL,
        grid_config_id VARCHAR(255) NOT NULL,
        variation_count INTEGER DEFAULT 1,
        status VARCHAR(50) DEFAULT 'pending',
        error_message TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_session_id ON generation_jobs(session_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON generation_jobs(status)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_generation_jobs_created_at ON generation_jobs(created_at)
    `;

    // Generated images table
    await sql`
      CREATE TABLE IF NOT EXISTS generated_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        generation_job_id UUID NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
        variation_index INTEGER NOT NULL,
        storage_key VARCHAR(500) NOT NULL,
        mime_type VARCHAR(100) DEFAULT 'image/png',
        file_size INTEGER,
        expires_at TIMESTAMPTZ,
        is_permanent BOOLEAN DEFAULT false,
        is_preview BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_generated_images_expires_at ON generated_images(expires_at)
      WHERE expires_at IS NOT NULL
    `;

    // Orders table
    await sql`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR(255),

        -- Customer info
        customer_name VARCHAR(255) NOT NULL,
        customer_email VARCHAR(255) NOT NULL,
        customer_phone VARCHAR(50) NOT NULL,

        -- Address
        street_address VARCHAR(500) NOT NULL,
        barangay VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        province VARCHAR(255) NOT NULL,
        postal_code VARCHAR(20) NOT NULL,
        delivery_zone VARCHAR(50) NOT NULL,

        -- Product info
        grid_config_id VARCHAR(255) NOT NULL,
        generation_job_id UUID REFERENCES generation_jobs(id) ON DELETE SET NULL,
        tile_assignments JSONB NOT NULL,

        -- Pricing (in centavos/smallest currency unit)
        product_price INTEGER NOT NULL,
        delivery_fee INTEGER NOT NULL,
        total_amount INTEGER NOT NULL,

        -- Status
        payment_status VARCHAR(50) DEFAULT 'pending',
        order_status VARCHAR(50) DEFAULT 'pending',

        -- Maya payment
        maya_checkout_id VARCHAR(255),
        maya_payment_id VARCHAR(255),

        -- Digital delivery
        composed_image_key VARCHAR(500),
        download_count INTEGER DEFAULT 0,
        max_downloads INTEGER DEFAULT 5,

        -- Timestamps
        paid_at TIMESTAMPTZ,
        shipped_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_orders_maya_checkout_id ON orders(maya_checkout_id)
    `;

    // Session quotas table
    await sql`
      CREATE TABLE IF NOT EXISTS session_quotas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255) UNIQUE NOT NULL,
        preview_count INTEGER DEFAULT 0,
        max_previews INTEGER DEFAULT 3,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_session_quotas_session_id ON session_quotas(session_id)
    `;
  },

  async down(sql: SQL): Promise<void> {
    // Drop tables in reverse order to respect foreign key constraints
    await sql`DROP TABLE IF EXISTS session_quotas CASCADE`;
    await sql`DROP TABLE IF EXISTS orders CASCADE`;
    await sql`DROP TABLE IF EXISTS generated_images CASCADE`;
    await sql`DROP TABLE IF EXISTS generation_jobs CASCADE`;
    await sql`DROP TABLE IF EXISTS uploaded_images CASCADE`;
    await sql`DROP TABLE IF EXISTS refresh_tokens CASCADE`;
    await sql`DROP TABLE IF EXISTS users CASCADE`;
  },
};

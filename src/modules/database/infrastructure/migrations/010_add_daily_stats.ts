import type { SQL } from 'bun';
import type { Migration } from './migration.interface';

export const migration010AddDailyStats: Migration = {
  name: '010_add_daily_stats',

  async up(sql: SQL): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS daily_stats (
        date DATE PRIMARY KEY,
        total_orders INTEGER DEFAULT 0,
        paid_orders INTEGER DEFAULT 0,
        total_revenue INTEGER DEFAULT 0,
        generation_jobs INTEGER DEFAULT 0,
        failed_jobs INTEGER DEFAULT 0,
        new_users INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;
  },

  async down(sql: SQL): Promise<void> {
    await sql`
      DROP TABLE IF EXISTS daily_stats
    `;
  },
};

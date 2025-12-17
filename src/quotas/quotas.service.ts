import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface SessionQuota {
  sessionId: string;
  previewCount: number;
  maxPreviews: number;
  remaining: number;
}

interface SessionQuotaRow {
  id: string;
  session_id: string;
  preview_count: number;
  max_previews: number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class QuotasService {
  private readonly logger = new Logger(QuotasService.name);

  // Default max previews for anonymous users
  private readonly DEFAULT_MAX_PREVIEWS = 3;

  constructor(private readonly db: DatabaseService) {}

  /**
   * Get quota for a session
   */
  async getQuota(sessionId: string): Promise<SessionQuota> {
    const rows = await this.db.sql<SessionQuotaRow[]>`
      SELECT * FROM session_quotas
      WHERE session_id = ${sessionId}
      LIMIT 1
    `;

    if (rows.length === 0) {
      // Session hasn't used any previews yet
      return {
        sessionId,
        previewCount: 0,
        maxPreviews: this.DEFAULT_MAX_PREVIEWS,
        remaining: this.DEFAULT_MAX_PREVIEWS,
      };
    }

    const row = rows[0];
    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: Math.max(0, row.max_previews - row.preview_count),
    };
  }

  /**
   * Check if session can generate more previews
   */
  async canGenerate(sessionId: string, requested = 1): Promise<boolean> {
    const quota = await this.getQuota(sessionId);
    return quota.remaining >= requested;
  }

  /**
   * Increment usage count for a session
   */
  async incrementUsage(sessionId: string, amount = 1): Promise<SessionQuota> {
    const incrementBy = Math.max(1, Math.floor(amount));

    // Upsert: insert if not exists, otherwise increment
    const rows = await this.db.sql<SessionQuotaRow[]>`
      INSERT INTO session_quotas (session_id, preview_count, max_previews)
      VALUES (${sessionId}, ${incrementBy}, ${this.DEFAULT_MAX_PREVIEWS})
      ON CONFLICT (session_id)
      DO UPDATE SET
        preview_count = session_quotas.preview_count + ${incrementBy},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const row = rows[0];
    this.logger.debug(`Session ${sessionId} preview count: ${row.preview_count}/${row.max_previews}`);

    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: Math.max(0, row.max_previews - row.preview_count),
    };
  }

  /**
   * Reset quota for a session (e.g., after purchase or signup)
   */
  async resetQuota(sessionId: string, maxPreviews?: number): Promise<SessionQuota> {
    const newMax = maxPreviews ?? this.DEFAULT_MAX_PREVIEWS;

    const rows = await this.db.sql<SessionQuotaRow[]>`
      INSERT INTO session_quotas (session_id, preview_count, max_previews)
      VALUES (${sessionId}, 0, ${newMax})
      ON CONFLICT (session_id)
      DO UPDATE SET
        preview_count = 0,
        max_previews = ${newMax},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const row = rows[0];
    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: row.max_previews,
    };
  }

  /**
   * Increase max quota for a session (e.g., after registration)
   */
  async increaseMaxQuota(sessionId: string, additionalPreviews: number): Promise<SessionQuota> {
    const rows = await this.db.sql<SessionQuotaRow[]>`
      INSERT INTO session_quotas (session_id, preview_count, max_previews)
      VALUES (${sessionId}, 0, ${this.DEFAULT_MAX_PREVIEWS + additionalPreviews})
      ON CONFLICT (session_id)
      DO UPDATE SET
        max_previews = session_quotas.max_previews + ${additionalPreviews},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const row = rows[0];
    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: Math.max(0, row.max_previews - row.preview_count),
    };
  }
}

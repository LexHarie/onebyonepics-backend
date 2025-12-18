import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export const QUOTAS_REPOSITORY = Symbol('QUOTAS_REPOSITORY');

export interface SessionQuotaRow {
  id: string;
  session_id: string;
  preview_count: number;
  max_previews: number;
  created_at: Date;
  updated_at: Date;
}

export interface QuotasRepositoryInterface {
  findBySessionId(sessionId: string): Promise<SessionQuotaRow | null>;
  upsertIncrement(params: {
    sessionId: string;
    incrementBy: number;
    maxPreviews: number;
  }): Promise<SessionQuotaRow>;
  upsertReset(params: {
    sessionId: string;
    maxPreviews: number;
  }): Promise<SessionQuotaRow>;
  upsertIncreaseMax(params: {
    sessionId: string;
    additionalPreviews: number;
    baseMaxPreviews: number;
  }): Promise<SessionQuotaRow>;
  deleteBySessionId(sessionId: string): Promise<void>;
}

@Injectable()
export class QuotasRepository implements QuotasRepositoryInterface {
  constructor(private readonly db: DatabaseService) {}

  async findBySessionId(sessionId: string): Promise<SessionQuotaRow | null> {
    const rows = await this.db.sql<SessionQuotaRow[]>`
      SELECT * FROM session_quotas
      WHERE session_id = ${sessionId}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  async upsertIncrement(params: {
    sessionId: string;
    incrementBy: number;
    maxPreviews: number;
  }): Promise<SessionQuotaRow> {
    const rows = await this.db.sql<SessionQuotaRow[]>`
      INSERT INTO session_quotas (session_id, preview_count, max_previews)
      VALUES (${params.sessionId}, ${params.incrementBy}, ${params.maxPreviews})
      ON CONFLICT (session_id)
      DO UPDATE SET
        preview_count = session_quotas.preview_count + ${params.incrementBy},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    return rows[0];
  }

  async upsertReset(params: {
    sessionId: string;
    maxPreviews: number;
  }): Promise<SessionQuotaRow> {
    const rows = await this.db.sql<SessionQuotaRow[]>`
      INSERT INTO session_quotas (session_id, preview_count, max_previews)
      VALUES (${params.sessionId}, 0, ${params.maxPreviews})
      ON CONFLICT (session_id)
      DO UPDATE SET
        preview_count = 0,
        max_previews = ${params.maxPreviews},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    return rows[0];
  }

  async upsertIncreaseMax(params: {
    sessionId: string;
    additionalPreviews: number;
    baseMaxPreviews: number;
  }): Promise<SessionQuotaRow> {
    const rows = await this.db.sql<SessionQuotaRow[]>`
      INSERT INTO session_quotas (session_id, preview_count, max_previews)
      VALUES (${params.sessionId}, 0, ${params.baseMaxPreviews + params.additionalPreviews})
      ON CONFLICT (session_id)
      DO UPDATE SET
        max_previews = session_quotas.max_previews + ${params.additionalPreviews},
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    return rows[0];
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    await this.db.sql`
      DELETE FROM session_quotas
      WHERE session_id = ${sessionId}
    `;
  }
}

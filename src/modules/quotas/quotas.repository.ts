import type { SQL } from 'bun';
import type {
  IQuotasRepository,
  SessionQuotaRow,
} from './domain/quotas.repository.interface';
import { getSql } from '../../lib/database';

export class QuotasRepository implements IQuotasRepository {
  constructor(private readonly sql: SQL) {}

  async findBySessionId(sessionId: string): Promise<SessionQuotaRow | null> {
    const rows = await this.sql<SessionQuotaRow[]>`
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
    const rows = await this.sql<SessionQuotaRow[]>`
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
    const rows = await this.sql<SessionQuotaRow[]>`
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
    const rows = await this.sql<SessionQuotaRow[]>`
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
    await this.sql`
      DELETE FROM session_quotas
      WHERE session_id = ${sessionId}
    `;
  }
}

export const createQuotasRepository = () => new QuotasRepository(getSql());

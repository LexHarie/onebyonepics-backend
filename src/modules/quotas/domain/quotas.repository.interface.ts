export interface SessionQuotaRow {
  id: string;
  session_id: string;
  preview_count: number;
  max_previews: number;
  created_at: Date;
  updated_at: Date;
}

export interface IQuotasRepository {
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

export const IQuotasRepositoryToken = Symbol('IQuotasRepository');

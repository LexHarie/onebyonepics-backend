import type { IQuotasRepository } from './domain/quotas.repository.interface';

export interface SessionQuota {
  sessionId: string;
  previewCount: number;
  maxPreviews: number;
  remaining: number;
}

export class QuotasService {
  private readonly defaultMaxPreviews = 3;

  constructor(private readonly quotasRepository: IQuotasRepository) {}

  async getQuota(sessionId: string): Promise<SessionQuota> {
    const row = await this.quotasRepository.findBySessionId(sessionId);
    if (!row) {
      return {
        sessionId,
        previewCount: 0,
        maxPreviews: this.defaultMaxPreviews,
        remaining: this.defaultMaxPreviews,
      };
    }

    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: Math.max(0, row.max_previews - row.preview_count),
    };
  }

  async canGenerate(sessionId: string, requested = 1): Promise<boolean> {
    const quota = await this.getQuota(sessionId);
    return quota.remaining >= requested;
  }

  async incrementUsage(sessionId: string, amount = 1): Promise<SessionQuota> {
    const incrementBy = Math.max(1, Math.floor(amount));
    const row = await this.quotasRepository.upsertIncrement({
      sessionId,
      incrementBy,
      maxPreviews: this.defaultMaxPreviews,
    });

    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: Math.max(0, row.max_previews - row.preview_count),
    };
  }

  async resetQuota(sessionId: string, maxPreviews?: number): Promise<SessionQuota> {
    const newMax = maxPreviews ?? this.defaultMaxPreviews;
    const row = await this.quotasRepository.upsertReset({
      sessionId,
      maxPreviews: newMax,
    });

    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: row.max_previews,
    };
  }

  async increaseMaxQuota(
    sessionId: string,
    additionalPreviews: number,
  ): Promise<SessionQuota> {
    const row = await this.quotasRepository.upsertIncreaseMax({
      sessionId,
      additionalPreviews,
      baseMaxPreviews: this.defaultMaxPreviews,
    });

    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: Math.max(0, row.max_previews - row.preview_count),
    };
  }
}

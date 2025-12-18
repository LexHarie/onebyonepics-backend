import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IQuotasRepository,
  IQuotasRepositoryToken,
} from '../domain/quotas.repository.interface';

export interface SessionQuota {
  sessionId: string;
  previewCount: number;
  maxPreviews: number;
  remaining: number;
}

@Injectable()
export class QuotasService {
  private readonly logger = new Logger(QuotasService.name);

  // Default max previews for anonymous users
  private readonly DEFAULT_MAX_PREVIEWS = 3;

  constructor(
    @Inject(IQuotasRepositoryToken)
    private readonly quotasRepository: IQuotasRepository,
  ) {}

  /**
   * Get quota for a session
   */
  async getQuota(sessionId: string): Promise<SessionQuota> {
    const row = await this.quotasRepository.findBySessionId(sessionId);
    if (!row) {
      // Session hasn't used any previews yet
      return {
        sessionId,
        previewCount: 0,
        maxPreviews: this.DEFAULT_MAX_PREVIEWS,
        remaining: this.DEFAULT_MAX_PREVIEWS,
      };
    }

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

    const row = await this.quotasRepository.upsertIncrement({
      sessionId,
      incrementBy,
      maxPreviews: this.DEFAULT_MAX_PREVIEWS,
    });
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

  /**
   * Increase max quota for a session (e.g., after registration)
   */
  async increaseMaxQuota(sessionId: string, additionalPreviews: number): Promise<SessionQuota> {
    const row = await this.quotasRepository.upsertIncreaseMax({
      sessionId,
      additionalPreviews,
      baseMaxPreviews: this.DEFAULT_MAX_PREVIEWS,
    });
    return {
      sessionId: row.session_id,
      previewCount: row.preview_count,
      maxPreviews: row.max_previews,
      remaining: Math.max(0, row.max_previews - row.preview_count),
    };
  }
}

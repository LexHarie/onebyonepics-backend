import { config } from '../../config/env';
import { getRedis } from '../../lib/redis';
import { AppLogger } from '../../lib/logger';
import {
  DEFAULT_TOKEN_ESTIMATE,
  FALLBACK_MODEL,
  MODEL_RATE_LIMITS,
  PRIMARY_MODEL,
  RATE_LIMIT_ERROR_CODES,
  RATE_LIMIT_REDIS_PREFIX,
  REDIS_TTL,
  type ModelRateLimitConfig,
} from './domain/rate-limiter.constants';

export interface RateLimitStatus {
  model: string;
  rpm: { current: number; limit: number; remaining: number };
  tpm: { current: number; limit: number; remaining: number };
  rpd: { current: number; limit: number; remaining: number };
  isAvailable: boolean;
}

export interface AvailableModelResult {
  model: string;
  isFallback: boolean;
}

export class RateLimitExceededException extends Error {
  constructor(
    public readonly code: string,
    public readonly model: string,
    message: string,
  ) {
    super(message);
    this.name = 'RateLimitExceededException';
  }
}

export class RateLimiterService {
  private readonly logger = new AppLogger('RateLimiter');
  private readonly redis: ReturnType<typeof getRedis>;
  private readonly prefix: string;
  private readonly modelLimits: Record<string, ModelRateLimitConfig>;
  private readonly primaryModel: string;
  private readonly fallbackModel: string;

  constructor() {
    this.redis = getRedis();
    this.prefix = RATE_LIMIT_REDIS_PREFIX;
    this.primaryModel = config.google.primaryModel || PRIMARY_MODEL;
    this.fallbackModel = config.google.fallbackModel || FALLBACK_MODEL;

    const configuredLimits = config.rateLimit.models;
    this.modelLimits = Object.keys(configuredLimits).length
      ? { ...configuredLimits }
      : { ...MODEL_RATE_LIMITS };

    if (!this.modelLimits[this.primaryModel]) {
      this.modelLimits[this.primaryModel] = MODEL_RATE_LIMITS[PRIMARY_MODEL];
      this.logger.warn(
        `Rate limits missing for ${this.primaryModel}, falling back to default limits.`,
      );
    }

    if (!this.modelLimits[this.fallbackModel]) {
      this.modelLimits[this.fallbackModel] = MODEL_RATE_LIMITS[FALLBACK_MODEL];
      this.logger.warn(
        `Rate limits missing for ${this.fallbackModel}, falling back to default limits.`,
      );
    }
  }

  private getMinuteKey(): string {
    return Math.floor(Date.now() / 60000).toString();
  }

  private getDayKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  private buildKey(
    model: string,
    metric: 'rpm' | 'tpm' | 'rpd',
    timestamp: string,
  ): string {
    return `${this.prefix}:${model}:${metric}:${timestamp}`;
  }

  async getModelStatus(model: string): Promise<RateLimitStatus> {
    const limits = this.modelLimits[model];
    if (!limits) {
      throw new Error(`Unknown model: ${model}`);
    }

    const minuteKey = this.getMinuteKey();
    const dayKey = this.getDayKey();

    const [rpmCount, tpmCount, rpdCount] = await Promise.all([
      this.redis.get(this.buildKey(model, 'rpm', minuteKey)),
      this.redis.get(this.buildKey(model, 'tpm', minuteKey)),
      this.redis.get(this.buildKey(model, 'rpd', dayKey)),
    ]);

    const rpm = Number.parseInt(rpmCount || '0', 10);
    const tpm = Number.parseInt(tpmCount || '0', 10);
    const rpd = Number.parseInt(rpdCount || '0', 10);

    const isAvailable = rpm < limits.rpm && tpm < limits.tpm && rpd < limits.rpd;

    return {
      model,
      rpm: {
        current: rpm,
        limit: limits.rpm,
        remaining: Math.max(0, limits.rpm - rpm),
      },
      tpm: {
        current: tpm,
        limit: limits.tpm,
        remaining: Math.max(0, limits.tpm - tpm),
      },
      rpd: {
        current: rpd,
        limit: limits.rpd,
        remaining: Math.max(0, limits.rpd - rpd),
      },
      isAvailable,
    };
  }

  async canMakeRequest(
    model: string,
    estimatedTokens: number = DEFAULT_TOKEN_ESTIMATE,
  ): Promise<boolean> {
    const status = await this.getModelStatus(model);
    return (
      status.rpm.remaining > 0 &&
      status.tpm.remaining >= estimatedTokens &&
      status.rpd.remaining > 0
    );
  }

  async getAvailableModel(
    estimatedTokens: number = DEFAULT_TOKEN_ESTIMATE,
  ): Promise<AvailableModelResult | null> {
    const primaryAvailable = await this.canMakeRequest(
      this.primaryModel,
      estimatedTokens,
    );
    if (primaryAvailable) {
      return { model: this.primaryModel, isFallback: false };
    }

    this.logger.warn(
      `Primary model ${this.primaryModel} rate limit reached, trying fallback`,
    );

    const fallbackAvailable = await this.canMakeRequest(
      this.fallbackModel,
      estimatedTokens,
    );
    if (fallbackAvailable) {
      this.logger.log(`Using fallback model ${this.fallbackModel}`);
      return { model: this.fallbackModel, isFallback: true };
    }

    this.logger.error('All models rate limited');
    return null;
  }

  async recordRequest(
    model: string,
    tokenCount: number = DEFAULT_TOKEN_ESTIMATE,
  ): Promise<void> {
    const minuteKey = this.getMinuteKey();
    const dayKey = this.getDayKey();

    const rpmKey = this.buildKey(model, 'rpm', minuteKey);
    const tpmKey = this.buildKey(model, 'tpm', minuteKey);
    const rpdKey = this.buildKey(model, 'rpd', dayKey);

    await Promise.all([
      this.redis.incr(rpmKey),
      this.redis.expire(rpmKey, REDIS_TTL.MINUTE),
      this.redis.send('INCRBY', [tpmKey, String(tokenCount)]),
      this.redis.expire(tpmKey, REDIS_TTL.MINUTE),
      this.redis.incr(rpdKey),
      this.redis.expire(rpdKey, REDIS_TTL.DAY),
    ]);
  }

  async acquireSlot(
    estimatedTokens: number = DEFAULT_TOKEN_ESTIMATE,
  ): Promise<AvailableModelResult> {
    const available = await this.getAvailableModel(estimatedTokens);

    if (!available) {
      const primaryStatus = await this.getModelStatus(this.primaryModel);
      const fallbackStatus = await this.getModelStatus(this.fallbackModel);

      if (
        primaryStatus.rpd.remaining === 0 &&
        fallbackStatus.rpd.remaining === 0
      ) {
        throw new RateLimitExceededException(
          RATE_LIMIT_ERROR_CODES.RPD_EXCEEDED,
          'all',
          'Daily rate limit exceeded for all models. Please try again tomorrow.',
        );
      }

      throw new RateLimitExceededException(
        RATE_LIMIT_ERROR_CODES.ALL_MODELS_EXHAUSTED,
        'all',
        'Rate limit exceeded for all models. Please try again in a minute.',
      );
    }

    return available;
  }

  async waitForAvailability(
    estimatedTokens: number = DEFAULT_TOKEN_ESTIMATE,
    timeoutMs: number = 60000,
    pollIntervalMs: number = 1000,
  ): Promise<AvailableModelResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const available = await this.getAvailableModel(estimatedTokens);
      if (available) {
        return available;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new RateLimitExceededException(
      RATE_LIMIT_ERROR_CODES.ALL_MODELS_EXHAUSTED,
      'all',
      `Timed out waiting for rate limit availability after ${timeoutMs}ms`,
    );
  }

  async getTimeUntilReset(model: string): Promise<{
    rpm: number;
    tpm: number;
    rpd: number;
  }> {
    const minuteKey = this.getMinuteKey();
    const dayKey = this.getDayKey();

    const [rpmTtl, tpmTtl, rpdTtl] = await Promise.all([
      this.redis.ttl(this.buildKey(model, 'rpm', minuteKey)),
      this.redis.ttl(this.buildKey(model, 'tpm', minuteKey)),
      this.redis.ttl(this.buildKey(model, 'rpd', dayKey)),
    ]);

    return {
      rpm: Math.max(0, rpmTtl) * 1000,
      tpm: Math.max(0, tpmTtl) * 1000,
      rpd: Math.max(0, rpdTtl) * 1000,
    };
  }

  getModelConfig(model: string): ModelRateLimitConfig | undefined {
    return this.modelLimits[model];
  }

  getConfiguredModels(): string[] {
    return Object.keys(this.modelLimits);
  }
}

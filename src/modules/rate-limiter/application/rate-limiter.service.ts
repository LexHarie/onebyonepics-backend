import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  RATE_LIMIT_REDIS_PREFIX,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  MODEL_RATE_LIMITS,
  REDIS_TTL,
  DEFAULT_TOKEN_ESTIMATE,
  RATE_LIMIT_ERROR_CODES,
  type ModelRateLimitConfig,
} from '../domain/rate-limiter.constants';

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

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('redis.url') || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
    this.prefix = RATE_LIMIT_REDIS_PREFIX;

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });

    this.redis.on('connect', () => {
      this.logger.log('Redis connected for rate limiting');
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Get the current minute timestamp key (floored to minute)
   */
  private getMinuteKey(): string {
    return Math.floor(Date.now() / 60000).toString();
  }

  /**
   * Get the current day timestamp key (floored to day in UTC)
   */
  private getDayKey(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  }

  /**
   * Build Redis key for a specific metric
   */
  private buildKey(model: string, metric: 'rpm' | 'tpm' | 'rpd', timestamp: string): string {
    return `${this.prefix}:${model}:${metric}:${timestamp}`;
  }

  /**
   * Get current usage for a model
   */
  async getModelStatus(model: string): Promise<RateLimitStatus> {
    const config = MODEL_RATE_LIMITS[model];
    if (!config) {
      throw new Error(`Unknown model: ${model}`);
    }

    const minuteKey = this.getMinuteKey();
    const dayKey = this.getDayKey();

    const [rpmCount, tpmCount, rpdCount] = await Promise.all([
      this.redis.get(this.buildKey(model, 'rpm', minuteKey)),
      this.redis.get(this.buildKey(model, 'tpm', minuteKey)),
      this.redis.get(this.buildKey(model, 'rpd', dayKey)),
    ]);

    const rpm = parseInt(rpmCount || '0', 10);
    const tpm = parseInt(tpmCount || '0', 10);
    const rpd = parseInt(rpdCount || '0', 10);

    const isAvailable =
      rpm < config.rpm && tpm < config.tpm && rpd < config.rpd;

    return {
      model,
      rpm: { current: rpm, limit: config.rpm, remaining: Math.max(0, config.rpm - rpm) },
      tpm: { current: tpm, limit: config.tpm, remaining: Math.max(0, config.tpm - tpm) },
      rpd: { current: rpd, limit: config.rpd, remaining: Math.max(0, config.rpd - rpd) },
      isAvailable,
    };
  }

  /**
   * Check if a request can be made for a specific model
   */
  async canMakeRequest(model: string, estimatedTokens: number = DEFAULT_TOKEN_ESTIMATE): Promise<boolean> {
    const status = await this.getModelStatus(model);
    return (
      status.rpm.remaining > 0 &&
      status.tpm.remaining >= estimatedTokens &&
      status.rpd.remaining > 0
    );
  }

  /**
   * Get the best available model, falling back if primary is exhausted
   * Returns null if all models are exhausted
   */
  async getAvailableModel(estimatedTokens: number = DEFAULT_TOKEN_ESTIMATE): Promise<AvailableModelResult | null> {
    // Try primary model first
    const primaryAvailable = await this.canMakeRequest(PRIMARY_MODEL, estimatedTokens);
    if (primaryAvailable) {
      return { model: PRIMARY_MODEL, isFallback: false };
    }

    this.logger.warn(`Primary model ${PRIMARY_MODEL} rate limit reached, trying fallback`);

    // Try fallback model
    const fallbackAvailable = await this.canMakeRequest(FALLBACK_MODEL, estimatedTokens);
    if (fallbackAvailable) {
      this.logger.log(`Using fallback model ${FALLBACK_MODEL}`);
      return { model: FALLBACK_MODEL, isFallback: true };
    }

    this.logger.error('All models rate limited');
    return null;
  }

  /**
   * Record a successful request and update counters
   */
  async recordRequest(model: string, tokenCount: number = DEFAULT_TOKEN_ESTIMATE): Promise<void> {
    const minuteKey = this.getMinuteKey();
    const dayKey = this.getDayKey();

    const rpmKey = this.buildKey(model, 'rpm', minuteKey);
    const tpmKey = this.buildKey(model, 'tpm', minuteKey);
    const rpdKey = this.buildKey(model, 'rpd', dayKey);

    const pipeline = this.redis.pipeline();

    // Increment RPM
    pipeline.incr(rpmKey);
    pipeline.expire(rpmKey, REDIS_TTL.MINUTE);

    // Increment TPM
    pipeline.incrby(tpmKey, tokenCount);
    pipeline.expire(tpmKey, REDIS_TTL.MINUTE);

    // Increment RPD
    pipeline.incr(rpdKey);
    pipeline.expire(rpdKey, REDIS_TTL.DAY);

    await pipeline.exec();

    this.logger.debug(`Recorded request for ${model}: tokens=${tokenCount}`);
  }

  /**
   * Acquire a rate limit slot atomically
   * Returns the model to use, or throws if no model is available
   */
  async acquireSlot(estimatedTokens: number = DEFAULT_TOKEN_ESTIMATE): Promise<AvailableModelResult> {
    const available = await this.getAvailableModel(estimatedTokens);

    if (!available) {
      // Check which limit is hit for better error message
      const primaryStatus = await this.getModelStatus(PRIMARY_MODEL);
      const fallbackStatus = await this.getModelStatus(FALLBACK_MODEL);

      if (primaryStatus.rpd.remaining === 0 && fallbackStatus.rpd.remaining === 0) {
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

  /**
   * Wait until a model becomes available (with timeout)
   */
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

  /**
   * Get estimated time until rate limit resets (in ms)
   */
  async getTimeUntilReset(model: string): Promise<{ rpm: number; tpm: number; rpd: number }> {
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

  /**
   * Get rate limit configuration for a model
   */
  getModelConfig(model: string): ModelRateLimitConfig | undefined {
    return MODEL_RATE_LIMITS[model];
  }

  /**
   * Get all configured models
   */
  getConfiguredModels(): string[] {
    return Object.keys(MODEL_RATE_LIMITS);
  }
}

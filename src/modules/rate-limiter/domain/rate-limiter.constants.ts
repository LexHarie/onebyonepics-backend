/**
 * Rate limit configuration for Gemini AI models.
 */

export const RATE_LIMIT_REDIS_PREFIX = 'ratelimit';

/**
 * Model identifiers
 */
export const PRIMARY_MODEL = 'gemini-3-pro-image-preview';
export const FALLBACK_MODEL = 'gemini-2.5-flash-image';

/**
 * Rate limit configuration per model
 */
export interface ModelRateLimitConfig {
  /** Requests per minute */
  rpm: number;
  /** Tokens per minute */
  tpm: number;
  /** Requests per day */
  rpd: number;
}

export const MODEL_RATE_LIMITS: Record<string, ModelRateLimitConfig> = {
  [PRIMARY_MODEL]: {
    rpm: 20,
    tpm: 100_000,
    rpd: 250,
  },
  [FALLBACK_MODEL]: {
    rpm: 500,
    tpm: 500_000,
    rpd: 2_000,
  },
};

/**
 * Window durations in milliseconds
 */
export const WINDOW_DURATIONS = {
  /** 1 minute in ms */
  MINUTE: 60 * 1000,
  /** 1 day in ms */
  DAY: 24 * 60 * 60 * 1000,
};

/**
 * TTL for Redis keys in seconds
 */
export const REDIS_TTL = {
  /** TTL for per-minute counters (2 minutes for safety) */
  MINUTE: 120,
  /** TTL for per-day counters (25 hours for safety) */
  DAY: 90_000,
};

/**
 * Default token estimate when API response doesn't include metadata
 */
export const DEFAULT_TOKEN_ESTIMATE = 1500;

/**
 * Rate limit exceeded error codes
 */
export const RATE_LIMIT_ERROR_CODES = {
  RPM_EXCEEDED: 'RPM_EXCEEDED',
  TPM_EXCEEDED: 'TPM_EXCEEDED',
  RPD_EXCEEDED: 'RPD_EXCEEDED',
  ALL_MODELS_EXHAUSTED: 'ALL_MODELS_EXHAUSTED',
} as const;

import { t } from 'elysia';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import type { Static } from '@sinclair/typebox';

const EnvSchema = t.Object(
  {
    NODE_ENV: t.Optional(t.String()),
    PORT: t.Optional(t.String()),
    API_PREFIX: t.Optional(t.String()),
    FRONTEND_URL: t.Optional(t.String()),
    BACKEND_URL: t.Optional(t.String()),
    DATABASE_URL: t.String(),
    JWT_SECRET: t.Optional(t.String()),
    JWT_REFRESH_SECRET: t.Optional(t.String()),
    JWT_EXPIRES_IN: t.Optional(t.String()),
    JWT_REFRESH_EXPIRES_IN: t.Optional(t.String()),
    GOOGLE_API_KEY: t.Optional(t.String()),
    GOOGLE_GENAI_PRIMARY_MODEL: t.Optional(t.String()),
    GOOGLE_GENAI_FALLBACK_MODEL: t.Optional(t.String()),
    RATE_LIMIT_PRIMARY_RPM: t.Optional(t.String()),
    RATE_LIMIT_PRIMARY_TPM: t.Optional(t.String()),
    RATE_LIMIT_PRIMARY_RPD: t.Optional(t.String()),
    RATE_LIMIT_FALLBACK_RPM: t.Optional(t.String()),
    RATE_LIMIT_FALLBACK_TPM: t.Optional(t.String()),
    RATE_LIMIT_FALLBACK_RPD: t.Optional(t.String()),
    GENERATION_WORKER_CONCURRENCY: t.Optional(t.String()),
    PREVIEW_MAX_SIZE: t.Optional(t.String()),
    COMPOSITION_CONCURRENCY: t.Optional(t.String()),
    DO_SPACES_KEY: t.Optional(t.String()),
    DO_SPACES_SECRET: t.Optional(t.String()),
    DO_SPACES_REGION: t.Optional(t.String()),
    DO_SPACES_BUCKET: t.Optional(t.String()),
    DO_SPACES_CDN_ENDPOINT: t.Optional(t.String()),
    CORS_ORIGIN: t.Optional(t.String()),
    CLEANUP_ORIGINAL_IMAGES_HOURS: t.Optional(t.String()),
    CLEANUP_GENERATED_IMAGES_DAYS: t.Optional(t.String()),
    PAYMONGO_SECRET_KEY: t.Optional(t.String()),
    PAYMONGO_WEBHOOK_SECRET_KEY: t.Optional(t.String()),
    REDIS_URL: t.Optional(t.String()),
    BETTER_AUTH_SECRET: t.Optional(t.String()),
    GOOGLE_CLIENT_ID: t.Optional(t.String()),
    GOOGLE_CLIENT_SECRET: t.Optional(t.String()),
  },
  {
    additionalProperties: true,
  }
);

export type Env = Static<typeof EnvSchema>;

const compiler = TypeCompiler.Compile(EnvSchema);

export const env = (() => {
  const value = { ...process.env };
  if (!compiler.Check(value)) {
    const errors = [...compiler.Errors(value)]
      .map((error) => `${error.path} ${error.message}`)
      .join(', ');
    throw new Error(`Invalid environment variables: ${errors}`);
  }
  return value as Env;
})();

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const buildBackendUrl = (frontend: string, isProd: boolean) => {
  if (!isProd) {
    return 'http://localhost:3001';
  }

  try {
    const url = new URL(frontend);
    const host = url.host.replace(/^www\./, '');
    const backendHost = host.startsWith('api.') ? host : `api.${host}`;
    return `${url.protocol}//${backendHost}`;
  } catch {
    return 'https://api.onebyonepics.com';
  }
};

const isProduction = env.NODE_ENV === 'production';
const defaultFrontendUrl = isProduction
  ? 'https://onebyonepics.com'
  : 'http://localhost:5173';
const frontendUrl = env.FRONTEND_URL || defaultFrontendUrl;
const defaultBackendUrl = buildBackendUrl(frontendUrl, isProduction);
const primaryModel =
  env.GOOGLE_GENAI_PRIMARY_MODEL || 'gemini-3-pro-image-preview';
const fallbackModel = env.GOOGLE_GENAI_FALLBACK_MODEL || 'gemini-2.5-flash-image';

export const config = {
  app: {
    port: toInt(env.PORT, 3001),
    apiPrefix: env.API_PREFIX || 'api',
    frontendUrl,
    backendUrl: env.BACKEND_URL || defaultBackendUrl,
  },
  database: {
    url: env.DATABASE_URL,
  },
  jwt: {
    accessSecret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiresIn: env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  google: {
    apiKey: env.GOOGLE_API_KEY,
    primaryModel,
    fallbackModel,
  },
  rateLimit: {
    models: {
      [primaryModel]: {
        rpm: toInt(env.RATE_LIMIT_PRIMARY_RPM, 20),
        tpm: toInt(env.RATE_LIMIT_PRIMARY_TPM, 100000),
        rpd: toInt(env.RATE_LIMIT_PRIMARY_RPD, 250),
      },
      [fallbackModel]: {
        rpm: toInt(env.RATE_LIMIT_FALLBACK_RPM, 500),
        tpm: toInt(env.RATE_LIMIT_FALLBACK_TPM, 500000),
        rpd: toInt(env.RATE_LIMIT_FALLBACK_RPD, 2000),
      },
    },
    workerConcurrency: toInt(env.GENERATION_WORKER_CONCURRENCY, 2),
  },
  images: {
    previewMaxSize: toInt(env.PREVIEW_MAX_SIZE, 1024),
  },
  composition: {
    maxConcurrency: toInt(env.COMPOSITION_CONCURRENCY, 4),
  },
  spaces: {
    key: env.DO_SPACES_KEY,
    secret: env.DO_SPACES_SECRET,
    region: env.DO_SPACES_REGION,
    bucket: env.DO_SPACES_BUCKET,
    cdnEndpoint: env.DO_SPACES_CDN_ENDPOINT,
  },
  cors: {
    origin: env.CORS_ORIGIN || '*',
  },
  cleanup: {
    originalImagesHours: toInt(env.CLEANUP_ORIGINAL_IMAGES_HOURS, 24),
    generatedImagesDays: toInt(env.CLEANUP_GENERATED_IMAGES_DAYS, 7),
  },
  paymongo: {
    secretKey: env.PAYMONGO_SECRET_KEY,
    webhookSecretKey: env.PAYMONGO_WEBHOOK_SECRET_KEY,
  },
  redis: {
    url: env.REDIS_URL || 'redis://localhost:6379',
  },
} as const;

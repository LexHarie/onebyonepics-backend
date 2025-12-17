export default () => ({
  app: {
    port: parseInt(process.env.PORT || '3001', 10),
    apiPrefix: process.env.API_PREFIX || 'api',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
    primaryModel: process.env.GOOGLE_GENAI_PRIMARY_MODEL || 'gemini-3-pro-image-preview',
    fallbackModel: process.env.GOOGLE_GENAI_FALLBACK_MODEL || 'gemini-2.5-flash-image',
  },
  rateLimit: {
    // Rate limits per model (can be overridden via env vars)
    models: {
      'gemini-3-pro-image-preview': {
        rpm: parseInt(process.env.RATE_LIMIT_PRIMARY_RPM || '20', 10),
        tpm: parseInt(process.env.RATE_LIMIT_PRIMARY_TPM || '100000', 10),
        rpd: parseInt(process.env.RATE_LIMIT_PRIMARY_RPD || '250', 10),
      },
      'gemini-2.5-flash-image': {
        rpm: parseInt(process.env.RATE_LIMIT_FALLBACK_RPM || '500', 10),
        tpm: parseInt(process.env.RATE_LIMIT_FALLBACK_TPM || '500000', 10),
        rpd: parseInt(process.env.RATE_LIMIT_FALLBACK_RPD || '2000', 10),
      },
    },
    // Worker concurrency (should be less than RPM / avg_requests_per_job)
    workerConcurrency: parseInt(process.env.GENERATION_WORKER_CONCURRENCY || '5', 10),
  },
  spaces: {
    key: process.env.DO_SPACES_KEY,
    secret: process.env.DO_SPACES_SECRET,
    region: process.env.DO_SPACES_REGION,
    bucket: process.env.DO_SPACES_BUCKET,
    cdnEndpoint: process.env.DO_SPACES_CDN_ENDPOINT,
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
  cleanup: {
    originalImagesHours: parseInt(process.env.CLEANUP_ORIGINAL_IMAGES_HOURS || '24', 10),
    generatedImagesDays: parseInt(process.env.CLEANUP_GENERATED_IMAGES_DAYS || '7', 10),
  },
  maya: {
    sandbox: process.env.MAYA_SANDBOX !== 'false',
    publicKey: process.env.MAYA_PUBLIC_KEY,
    secretKey: process.env.MAYA_SECRET_KEY,
    webhookSecretKey: process.env.MAYA_WEBHOOK_SECRET_KEY,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
});

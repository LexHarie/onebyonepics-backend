export default () => {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultFrontendUrl = isProduction
    ? 'https://onebyonepics.com'
    : 'http://localhost:5173';
  const frontendUrl = process.env.FRONTEND_URL || defaultFrontendUrl;
  const primaryModel =
    process.env.GOOGLE_GENAI_PRIMARY_MODEL || 'gemini-3-pro-image-preview';
  const fallbackModel =
    process.env.GOOGLE_GENAI_FALLBACK_MODEL || 'gemini-2.5-flash-image';
  const mayaSandbox = process.env.MAYA_SANDBOX !== 'false';
  const defaultMayaWebhookIps = mayaSandbox
    ? ['13.229.160.234', '3.1.199.75']
    : ['18.138.50.235', '3.1.207.200'];
  const mayaWebhookAllowedIps = process.env.MAYA_WEBHOOK_ALLOWED_IPS
    ? process.env.MAYA_WEBHOOK_ALLOWED_IPS.split(',')
        .map((ip) => ip.trim())
        .filter(Boolean)
    : defaultMayaWebhookIps;

  return {
    app: {
      port: parseInt(process.env.PORT || '3001', 10),
      apiPrefix: process.env.API_PREFIX || 'api',
      frontendUrl,
      backendUrl: process.env.BACKEND_URL || 'http://localhost:3001',
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
      primaryModel,
      fallbackModel,
    },
    rateLimit: {
      // Rate limits per model (can be overridden via env vars)
      models: {
        [primaryModel]: {
          rpm: parseInt(process.env.RATE_LIMIT_PRIMARY_RPM || '20', 10),
          tpm: parseInt(process.env.RATE_LIMIT_PRIMARY_TPM || '100000', 10),
          rpd: parseInt(process.env.RATE_LIMIT_PRIMARY_RPD || '250', 10),
        },
        [fallbackModel]: {
          rpm: parseInt(process.env.RATE_LIMIT_FALLBACK_RPM || '500', 10),
          tpm: parseInt(process.env.RATE_LIMIT_FALLBACK_TPM || '500000', 10),
          rpd: parseInt(process.env.RATE_LIMIT_FALLBACK_RPD || '2000', 10),
        },
      },
      // Worker concurrency (should be less than RPM / avg_requests_per_job)
      workerConcurrency: parseInt(
        process.env.GENERATION_WORKER_CONCURRENCY || '5',
        10,
      ),
    },
    composition: {
      maxConcurrency: parseInt(process.env.COMPOSITION_CONCURRENCY || '4', 10),
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
      originalImagesHours: parseInt(
        process.env.CLEANUP_ORIGINAL_IMAGES_HOURS || '24',
        10,
      ),
      generatedImagesDays: parseInt(
        process.env.CLEANUP_GENERATED_IMAGES_DAYS || '7',
        10,
      ),
    },
    maya: {
      sandbox: mayaSandbox,
      publicKey: process.env.MAYA_PUBLIC_KEY,
      secretKey: process.env.MAYA_SECRET_KEY,
      webhookSecretKey: process.env.MAYA_WEBHOOK_SECRET_KEY,
      webhookAllowedIps: mayaWebhookAllowedIps,
      // Payment verification against Maya API
      verificationEnabled: process.env.MAYA_VERIFICATION_ENABLED !== 'false',
      verificationMaxAttempts: parseInt(
        process.env.MAYA_VERIFICATION_MAX_ATTEMPTS || '5',
        10,
      ),
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
  };
};

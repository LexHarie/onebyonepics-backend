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
    model: process.env.GOOGLE_GENAI_MODEL || 'gemini-3-pro-image-preview',
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

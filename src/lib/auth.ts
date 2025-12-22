import { betterAuth } from 'better-auth';
import type { Pool } from 'pg';

// BetterAuth instance configuration
// This is the central auth configuration used by the NestJS module
export const createAuth = (pool: Pool) =>
  betterAuth({
    basePath: '/api/auth',
    secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET,
    database: pool,
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    trustedOrigins: [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });

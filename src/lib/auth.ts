import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
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
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    trustedOrigins: Array.from(
      new Set([
        process.env.FRONTEND_URL ||
          (process.env.NODE_ENV === 'production'
            ? 'https://onebyonepics.com'
            : 'http://localhost:5173'),
        'http://localhost:5173',
        'http://localhost:3000',
      ])
    ),
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    plugins: [
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
      }),
    ],
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });

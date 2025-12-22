#!/usr/bin/env bun
import { Pool } from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { createAuth } from '../src/lib/auth';

const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const adminName = process.env.ADMIN_NAME || 'Admin';

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!adminEmail || !adminPassword) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required');
  process.exit(1);
}

const normalizedEmail = adminEmail.trim().toLowerCase();
const pool = new Pool({ connectionString: databaseUrl });

try {
  const existing = await pool.query(
    'SELECT id, role FROM "user" WHERE email = $1',
    [normalizedEmail],
  );

  if (existing.rows.length > 0) {
    const userId = existing.rows[0].id as string;
    const currentRole = existing.rows[0].role as string | null;

    // Check if credential account exists
    const credentialAccount = await pool.query(
      'SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = $2',
      [userId, 'credential'],
    );

    if (credentialAccount.rows.length === 0) {
      // User exists but no credential account - create one
      const hashedPassword = await hashPassword(adminPassword);
      await pool.query(
        `INSERT INTO "account" (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [crypto.randomUUID(), userId, userId, 'credential', hashedPassword],
      );
      console.log(`Created credential account for ${normalizedEmail}`);
    }

    // Update role if needed
    if (currentRole !== 'admin') {
      await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [
        'admin',
        userId,
      ]);
      console.log(`Updated ${normalizedEmail} to admin role.`);
    } else {
      console.log(`Admin user already exists: ${normalizedEmail}`);
    }
    process.exit(0);
  }

  // User doesn't exist - create via Better Auth sign-up
  const auth = createAuth(pool);
  const url = new URL('/api/auth/sign-up/email', 'http://localhost');
  const request = new Request(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: adminName,
      email: normalizedEmail,
      password: adminPassword,
    }),
  });

  const response = await auth.handler(request);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to create admin user: ${response.status} ${message}`);
  }

  await pool.query('UPDATE "user" SET role = $1 WHERE email = $2', [
    'admin',
    normalizedEmail,
  ]);

  console.log(`Admin user created: ${normalizedEmail}`);
} catch (error) {
  console.error(error);
  process.exit(1);
} finally {
  await pool.end();
}

#!/usr/bin/env bun
import { SQL } from 'bun';
import { validateSchema } from '../src/modules/database/infrastructure/schema-validator';
import { getDatabaseSslConfig } from '../src/lib/database';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sslConfig = getDatabaseSslConfig(databaseUrl);
const sql = new SQL({ url: databaseUrl, tls: sslConfig });

console.log('Validating database schema against migrations...\n');

const { valid, errors } = await validateSchema(sql);

await sql.close();

if (valid) {
  console.log('✓ Schema is valid - database matches migrations\n');
  process.exit(0);
} else {
  console.error('✗ Schema validation failed:\n');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  console.error('\nFix: Create a migration to reconcile the differences.\n');
  process.exit(1);
}

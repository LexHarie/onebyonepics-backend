#!/usr/bin/env bun
import { SQL } from 'bun';
import { validateSchema } from '../src/modules/database/infrastructure/schema-validator';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

const sql = new SQL(databaseUrl);

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

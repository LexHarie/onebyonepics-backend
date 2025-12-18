#!/usr/bin/env bun
import { SQL } from 'bun';
import {
  runMigrations,
  getMigrationStatus,
} from '../src/modules/database/infrastructure/migrations';

const usage = `
Database Migration CLI

Usage: bun run scripts/migrate.ts [command]

Commands:
  up      Run all pending migrations (default)
  down    Rollback the last applied migration
  status  Show migration status

Environment:
  DATABASE_URL  Required. PostgreSQL connection string.

Examples:
  bun run migrate           # Run pending migrations
  bun run migrate up        # Same as above
  bun run migrate down      # Rollback last migration
  bun run migrate status    # Show status
`;

async function main() {
  const command = process.argv[2] || 'up';

  if (command === '--help' || command === '-h') {
    console.log(usage);
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const sql = new SQL({
    url: databaseUrl,
    max: 5,
    idleTimeout: 30,
    connectionTimeout: 30,
  });

  try {
    // Test connection
    await sql`SELECT 1`;
    console.log('Connected to database');

    switch (command) {
      case 'up': {
        console.log('\nRunning migrations...\n');
        const result = await runMigrations(sql, 'up');

        if (result.applied.length === 0) {
          console.log('\nNo pending migrations');
        } else {
          console.log(`\nApplied ${result.applied.length} migration(s):`);
          result.applied.forEach((name) => console.log(`  - ${name}`));
        }
        break;
      }

      case 'down': {
        console.log('\nRolling back last migration...\n');
        const result = await runMigrations(sql, 'down');

        if (result.applied.length === 0) {
          console.log('\nNo migrations to rollback');
        } else {
          console.log(`\nRolled back ${result.applied.length} migration(s):`);
          result.applied.forEach((name) => console.log(`  - ${name}`));
        }
        break;
      }

      case 'status': {
        const status = await getMigrationStatus(sql);

        console.log('\nMigration Status\n');

        if (status.applied.length > 0) {
          console.log('Applied migrations:');
          status.applied.forEach((m) =>
            console.log(`  - ${m.name} (${m.applied_at.toISOString()})`),
          );
        } else {
          console.log('No applied migrations');
        }

        console.log('');

        if (status.pending.length > 0) {
          console.log('Pending migrations:');
          status.pending.forEach((name) => console.log(`  - ${name}`));
        } else {
          console.log('No pending migrations');
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log(usage);
        process.exit(1);
    }

    await sql.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await sql.close();
    process.exit(1);
  }
}

main();

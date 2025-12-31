import type { SQL } from 'bun';
import { migrations } from './index';

interface AppliedMigration {
  name: string;
  applied_at: Date;
}

async function ensureMigrationsTable(sql: SQL): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

async function getAppliedMigrations(sql: SQL): Promise<AppliedMigration[]> {
  const rows = await sql`
    SELECT name, applied_at FROM _migrations ORDER BY applied_at ASC
  `;
  return rows as AppliedMigration[];
}

async function recordMigration(sql: SQL, name: string): Promise<void> {
  await sql`INSERT INTO _migrations (name) VALUES (${name})`;
}

async function removeMigration(sql: SQL, name: string): Promise<void> {
  await sql`DELETE FROM _migrations WHERE name = ${name}`;
}

export async function runMigrations(
  sql: SQL,
  direction: 'up' | 'down' = 'up',
): Promise<{ applied: string[]; skipped: string[] }> {
  await ensureMigrationsTable(sql);

  const applied = await getAppliedMigrations(sql);
  const appliedNames = new Set(applied.map((m) => m.name));

  const result = { applied: [] as string[], skipped: [] as string[] };

  if (direction === 'up') {
    for (const migration of migrations) {
      if (appliedNames.has(migration.name)) {
        result.skipped.push(migration.name);
        continue;
      }

      console.log(`Running migration: ${migration.name}`);
      await migration.up(sql);
      await recordMigration(sql, migration.name);
      result.applied.push(migration.name);
      console.log(`Completed migration: ${migration.name}`);
    }
  } else {
    // Rollback: run down() on the last applied migration
    const lastApplied = applied[applied.length - 1];
    if (!lastApplied) {
      console.log('No migrations to rollback');
      return result;
    }

    const migration = migrations.find((m) => m.name === lastApplied.name);
    if (!migration) {
      throw new Error(`Migration not found: ${lastApplied.name}`);
    }

    console.log(`Rolling back migration: ${migration.name}`);
    await migration.down(sql);
    await removeMigration(sql, migration.name);
    result.applied.push(migration.name);
    console.log(`Rolled back migration: ${migration.name}`);
  }

  return result;
}

export async function getMigrationStatus(
  sql: SQL,
): Promise<{ pending: string[]; applied: AppliedMigration[] }> {
  await ensureMigrationsTable(sql);

  const applied = await getAppliedMigrations(sql);
  const appliedNames = new Set(applied.map((m) => m.name));

  const pending = migrations
    .filter((m) => !appliedNames.has(m.name))
    .map((m) => m.name);

  return { pending, applied };
}

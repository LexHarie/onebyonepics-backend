import { Elysia } from 'elysia';
import { closeDatabase, getPool, getSql, initDatabase } from '../lib/database';

export const databasePlugin = new Elysia({ name: 'database' })
  .onStart(async () => {
    await initDatabase();
  })
  .derive(() => ({
    sql: getSql(),
    pool: getPool(),
  }))
  .onStop(async () => {
    await closeDatabase();
  });

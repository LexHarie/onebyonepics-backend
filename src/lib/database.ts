import { SQL } from 'bun';
import { Pool } from 'pg';
import { config } from '../config/env';

let sql: SQL | null = null;
let pool: Pool | null = null;

const buildSslConfig = (databaseUrl: string) => {
  let hostname = '';
  let sslMode: string | null = null;

  try {
    const url = new URL(databaseUrl);
    hostname = url.hostname;
    sslMode = url.searchParams.get('sslmode');
  } catch {
    hostname = databaseUrl;
  }

  const isLocalHost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1';
  const allowSelfSigned =
    process.env.DATABASE_SSL_ALLOW_SELF_SIGNED === 'true' ||
    process.env.DB_SSL_ALLOW_SELF_SIGNED === 'true';

  if (sslMode === 'disable' || sslMode === 'false') {
    return false;
  }

  if (!isLocalHost || sslMode || allowSelfSigned) {
    return {
      rejectUnauthorized: false,
      checkServerIdentity: () => undefined,
    };
  }

  return false;
};

const stripSslParamsFromUrl = (databaseUrl: string) => {
  try {
    const url = new URL(databaseUrl);
    const params = url.searchParams;
    const keysToRemove = [
      'ssl',
      'sslmode',
      'sslrootcert',
      'sslcert',
      'sslkey',
      'sslpassword',
    ];

    for (const key of keysToRemove) {
      params.delete(key);
    }

    url.search = params.toString();
    return url.toString();
  } catch {
    return databaseUrl;
  }
};

const getDatabaseUrl = () => {
  const url = config.database.url;
  if (!url) {
    throw new Error('DATABASE_URL is not configured');
  }
  return url;
};

const ensureSql = () => {
  if (!sql) {
    const databaseUrl = getDatabaseUrl();
    const sslConfig = buildSslConfig(databaseUrl);
    sql = new SQL({
      url: databaseUrl,
      tls: sslConfig,
      max: 18,
      idleTimeout: 30,
      connectionTimeout: 30,
    });
  }
  return sql;
};

const ensurePool = () => {
  if (!pool) {
    const databaseUrl = getDatabaseUrl();
    const sslConfig = buildSslConfig(databaseUrl);
    const sanitizedUrl = stripSslParamsFromUrl(databaseUrl);

    pool = new Pool({
      connectionString: sanitizedUrl,
      ssl: sslConfig,
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }
  return pool;
};

export const initDatabase = async () => {
  const sqlInstance = ensureSql();
  ensurePool();
  await sqlInstance`SELECT 1`;
};

export const getSql = () => ensureSql();

export const getPool = () => ensurePool();

export const getDatabaseSslConfig = (databaseUrl: string) =>
  buildSslConfig(databaseUrl);

export const getDatabaseConnectionString = (databaseUrl: string) =>
  stripSslParamsFromUrl(databaseUrl);

export const closeDatabase = async () => {
  if (sql) {
    await sql.close();
    sql = null;
  }

  if (pool) {
    await pool.end();
    pool = null;
  }
};

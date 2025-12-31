import { Elysia } from 'elysia';
import { createAuth } from '../lib/auth';
import { config } from '../config/env';
import { getPool } from '../lib/database';

const joinUrl = (base: string, ...parts: string[]) => {
  const trimmedBase = base.replace(/\/+$/, '');
  const path = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

  return path ? `${trimmedBase}/${path}` : trimmedBase;
};

const authBaseUrl = joinUrl(
  config.app.backendUrl,
  config.app.apiPrefix,
  'auth',
);
const auth = createAuth(
  getPool(),
  `/${config.app.apiPrefix}/auth`,
  authBaseUrl,
);

export const authContextPlugin = new Elysia({ name: 'auth-context' }).decorate(
  'auth',
  auth,
);

export const authPlugin = new Elysia({ name: 'auth' })
  .use(authContextPlugin)
  .mount(auth.handler);

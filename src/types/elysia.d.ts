import type { Auth } from 'better-auth';

declare module 'elysia' {
  interface Context {
    auth: Auth;
  }
}

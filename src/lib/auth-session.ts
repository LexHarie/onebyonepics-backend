import type { Auth } from 'better-auth';

export type AuthSession = Awaited<ReturnType<Auth['api']['getSession']>>;

export const getAuthSession = async (
  auth: Auth,
  request: Request,
): Promise<AuthSession | null> => {
  try {
    return (await auth.api.getSession({ headers: request.headers })) ?? null;
  } catch {
    return null;
  }
};

import { Injectable, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard, BETTER_AUTH_INSTANCE_TOKEN } from '@buiducnhat/nest-better-auth';
import type { Auth } from 'better-auth';

/**
 * OptionalAuthGuard - Allows both authenticated and anonymous access
 *
 * Unlike the standard AuthGuard which throws 401 for unauthenticated requests,
 * this guard:
 * - Tries to authenticate the user via Better Auth session
 * - If authenticated, attaches user to request.user
 * - If not authenticated, continues without error (request.user = undefined)
 * - Always allows the request to proceed
 *
 * Use this for routes where auth is optional (e.g., session-based anonymous users)
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard {
  constructor(
    reflector: Reflector,
    @Inject(BETTER_AUTH_INSTANCE_TOKEN) auth: Auth,
  ) {
    super(reflector, auth);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      // Try to authenticate - this will set request.user if session exists
      await super.canActivate(context);
    } catch {
      // Ignore auth errors - allow anonymous access
      // request.user will be undefined
    }

    // Always allow the request to proceed
    return true;
  }
}

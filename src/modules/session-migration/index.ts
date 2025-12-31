import { Elysia } from 'elysia';
import { getAuthSession } from '../../lib/auth-session';
import { httpError } from '../../lib/http-error';
import { SessionMigrationService } from './session-migration.service';
import { createSessionMigrationRepository } from './session-migration.repository';
import { sessionMigrationSchema } from './session-migration.schema';
import { authContextPlugin } from '../../plugins/auth.plugin';

const migrationService = new SessionMigrationService(
  createSessionMigrationRepository(),
);

export const sessionMigrationModule = new Elysia({ name: 'session-migration' })
  .use(authContextPlugin)
  .post(
    '/session/migrate',
    async ({ body, request, auth }) => {
      const session = await getAuthSession(auth, request);
      const user = session?.user;
      if (!user) {
        throw httpError(401, 'Must be authenticated to migrate session');
      }

      const result = await migrationService.migrateSession(
        body.sessionId,
        user.id,
      );

      return {
        success: true,
        message: 'Session migrated successfully',
        ...result,
      };
    },
    {
      body: sessionMigrationSchema.body,
    },
  );

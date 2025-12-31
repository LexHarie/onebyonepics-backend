import { Elysia } from 'elysia';
import { AppLogger } from '../lib/logger';

const logger = new AppLogger('ExceptionsHandler');

const getStatus = (error: unknown) => {
  if (error && typeof error === 'object' && 'status' in error) {
    const value = (error as { status?: unknown }).status;
    if (typeof value === 'number') {
      return value;
    }
  }
  return 500;
};

export const errorHandlerPlugin = new Elysia({ name: 'error-handler' }).onError(
  ({ error, set }) => {
    const status = getStatus(error);
    set.status = status;

    if (status >= 500) {
      logger.error('Unhandled exception', error);
    }

    const payload: Record<string, unknown> = {
      statusCode: status,
      message: error instanceof Error ? error.message : 'Internal server error',
    };
    if (error && typeof error === 'object') {
      if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
        payload.code = (error as { code: string }).code;
      }
      if (
        'details' in error &&
        typeof (error as { details?: unknown }).details === 'object'
      ) {
        payload.details = (error as { details: Record<string, unknown> }).details;
      }
    }
    return payload;
  },
);

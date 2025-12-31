import { Elysia } from 'elysia';
import { AppLogger, formatStatus } from '../lib/logger';

const httpLogger = new AppLogger('HTTP');
const requestStartKey = Symbol('requestStart');
const requestLoggedKey = Symbol('requestLogged');

const getPath = (request: Request) => {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
};

const getStart = (request: Request) =>
  (request as Request & { [requestStartKey]?: number })[requestStartKey];

const markLogged = (request: Request) => {
  (request as Request & { [requestLoggedKey]?: boolean })[requestLoggedKey] =
    true;
};

const isLogged = (request: Request) =>
  (request as Request & { [requestLoggedKey]?: boolean })[requestLoggedKey];

const logRequest = (params: {
  request: Request;
  status: number;
  error?: unknown;
}) => {
  const startedAt = getStart(params.request);
  const durationMs =
    startedAt === undefined ? 0 : Math.round(performance.now() - startedAt);
  const message = `${params.request.method} ${getPath(params.request)} ${formatStatus(
    params.status,
  )} ${durationMs}ms`;

  if (params.status >= 500) {
    httpLogger.error(message, params.error);
  } else if (params.status >= 400) {
    httpLogger.warn(message);
  } else {
    httpLogger.log(message);
  }
};

export const httpLoggerPlugin = new Elysia({ name: 'http-logger' })
  .onRequest(({ request }) => {
    (request as Request & { [requestStartKey]?: number })[requestStartKey] =
      performance.now();
  })
  .onAfterHandle(({ request, set, response }) => {
    if (isLogged(request)) {
      return;
    }
    markLogged(request);

    const status =
      typeof set.status === 'number'
        ? set.status
        : response instanceof Response
          ? response.status
          : 200;

    logRequest({ request, status });
  })
  .onError(({ request, set, error }) => {
    if (isLogged(request)) {
      return;
    }
    markLogged(request);

    const status = typeof set.status === 'number' ? set.status : 500;
    logRequest({ request, status, error });
  });

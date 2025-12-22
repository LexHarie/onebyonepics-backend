import { cpus } from 'os';
import { Worker } from 'worker_threads';

const DEFAULT_CONCURRENCY = 5;
const DEFAULT_DELAY_MS = 250;

type LoggerLike = {
  error: (message: string, trace?: string) => void;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const toError = (reason: unknown): Error => {
  if (reason instanceof Error) return reason;
  return new Error(`Non-Error thrown: ${String(reason)}`);
};

const normalizeConcurrency = (concurrency: number): number => {
  if (!Number.isFinite(concurrency)) {
    throw new RangeError(`Invalid concurrency value: ${concurrency}`);
  }
  const normalized = Math.floor(concurrency);
  if (normalized < 1) {
    throw new RangeError(`Concurrency must be at least 1. Received: ${concurrency}`);
  }
  return normalized;
};

const normalizeDelay = (delayMs: number): number => {
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new RangeError(`Delay must be a non-negative number. Received: ${delayMs}`);
  }
  return delayMs;
};

const createStartGate = (delayMs: number) => {
  if (delayMs === 0) {
    return async () => {};
  }

  let nextStart = Date.now();
  let chain = Promise.resolve();

  return async () => {
    const scheduled = chain.then(async () => {
      const now = Date.now();
      const waitMs = Math.max(0, nextStart - now);
      nextStart = Math.max(now, nextStart) + delayMs;
      if (waitMs > 0) {
        await sleep(waitMs);
      }
    });

    chain = scheduled.catch(() => undefined);
    await scheduled;
  };
};

/**
 * Process items with a concurrency limit, returning Promise.allSettled-style results.
 */
export async function processInBatchesSettled<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];

  const limit = normalizeConcurrency(concurrency);
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;

      try {
        const value = await processFn(items[currentIndex] as T, currentIndex);
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (error) {
        results[currentIndex] = { status: 'rejected', reason: error };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Process items with a concurrency limit and a delay between starts.
 */
export async function processInBatchesSettledWithDelay<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  concurrency: number = DEFAULT_CONCURRENCY,
  delayMs: number = DEFAULT_DELAY_MS,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) return [];

  const limit = normalizeConcurrency(concurrency);
  const delay = normalizeDelay(delayMs);
  const waitForTurn = createStartGate(delay);

  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;

      await waitForTurn();
      try {
        const value = await processFn(items[currentIndex] as T, currentIndex);
        results[currentIndex] = { status: 'fulfilled', value };
      } catch (error) {
        results[currentIndex] = { status: 'rejected', reason: error };
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Log failed results from Promise.allSettled-style arrays.
 */
export function logFailedResults<T>(
  results: PromiseSettledResult<T>[],
  operation: string,
  logger?: LoggerLike,
): AggregateError | null {
  const failedResults = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (failedResults.length === 0) {
    return null;
  }

  const errors = failedResults.map((result) => toError(result.reason));
  const message = `Batch operation '${operation}' had ${errors.length} failures out of ${results.length} items`;
  const aggregateError = new AggregateError(errors, message);

  if (logger) {
    logger.error(message, aggregateError.stack);
  } else {
    console.error(message);
    if (aggregateError.stack) {
      console.error(aggregateError.stack);
    }
  }

  return aggregateError;
}

export interface RetryOptions {
  retries?: number; // Number of retry attempts (default 3)
  initialDelayMs?: number; // Initial delay before the first retry (default 1000)
  maxDelayMs?: number; // Maximum delay cap (default 30000)
  backoffFactor?: number; // Multiply delay by this factor after each attempt (default 2)
  jitter?: number; // 0-1 multiplier for randomized delay (default 0)
  shouldRetry?: (error: Error, attempt: number) => boolean | Promise<boolean>;
  onRetry?: (error: Error, attempt: number, delayMs: number) => void | Promise<void>;
}

/**
 * Retry a function with exponential backoff and optional jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    jitter = 0,
    shouldRetry,
    onRetry,
  }: RetryOptions = {},
): Promise<T> {
  if (!Number.isFinite(retries) || retries < 0) {
    throw new RangeError(`Invalid 'retries' value: ${retries}`);
  }
  if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
    throw new RangeError(`Invalid 'initialDelayMs' value: ${initialDelayMs}`);
  }
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
    throw new RangeError(`Invalid 'maxDelayMs' value: ${maxDelayMs}`);
  }
  if (!Number.isFinite(backoffFactor) || backoffFactor < 1) {
    throw new RangeError(`Invalid 'backoffFactor' value: ${backoffFactor}`);
  }
  if (!Number.isFinite(jitter) || jitter < 0 || jitter > 1) {
    throw new RangeError(`Invalid 'jitter' value: ${jitter}`);
  }

  const errors: Error[] = [];
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const currentError = toError(error);
      errors.push(currentError);

      if (attempt >= retries) {
        break;
      }

      const retryAttempt = attempt + 1;
      if (shouldRetry && !(await shouldRetry(currentError, retryAttempt))) {
        break;
      }

      const jitterAmount = delayMs * jitter;
      const randomizedDelay = jitterAmount
        ? delayMs + (Math.random() * 2 - 1) * jitterAmount
        : delayMs;
      const effectiveDelay = Math.min(maxDelayMs, Math.max(0, randomizedDelay));

      try {
        await onRetry?.(currentError, retryAttempt, effectiveDelay);
      } catch {
        // Ignore onRetry errors so retries still proceed.
      }

      await sleep(effectiveDelay);
      delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
    }
  }

  if (errors.length === 1) {
    throw errors[0];
  }
  throw new AggregateError(
    errors,
    `Retry failed after ${errors.length} attempt${errors.length === 1 ? '' : 's'}`,
  );
}

/**
 * Map items with a concurrency limit while preserving order.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number = DEFAULT_CONCURRENCY,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = normalizeConcurrency(concurrency);
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Process items in parallel using worker threads. Suitable for CPU-bound or blocking tasks.
 * NOTE: Only functions without captured scope should be used (they must be serializable).
 */
export async function processInWorkers<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R> | R,
  concurrency: number = cpus().length,
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = normalizeConcurrency(concurrency);
  const workerCount = Math.min(limit, items.length);
  const results: R[] = [];

  const fnString = processFn.toString();
  const workerCode = `
    const { parentPort, workerData } = require('worker_threads');
    const { task, fnString } = workerData;
    const processFn = new Function('return ' + fnString)();

    Promise.resolve(processFn(task))
      .then(result => parentPort.postMessage({ result }))
      .catch(err => parentPort.postMessage({ error: err && err.stack ? err.stack : String(err) }));
  `;

  const runWorker = (item: T) =>
    new Promise<R>((resolve, reject) => {
      const worker = new Worker(workerCode, {
        eval: true,
        workerData: { task: item, fnString },
      });

      let settled = false;
      const finalize = (fn: () => void) => {
        if (settled) return;
        settled = true;
        worker.removeAllListeners();
        worker.terminate().catch(() => undefined);
        fn();
      };

      worker.once('message', (msg) => {
        finalize(() => {
          if (msg?.error) {
            reject(new Error(`Worker failed: ${msg.error}`));
          } else {
            resolve(msg.result as R);
          }
        });
      });

      worker.once('error', (error) => {
        finalize(() => reject(toError(error)));
      });

      worker.once('exit', (code) => {
        if (code !== 0) {
          finalize(() => reject(new Error(`Worker exited with code ${code}`)));
        }
      });
    });

  for (let i = 0; i < items.length; i += workerCount) {
    const batch = items.slice(i, i + workerCount);
    const batchResults = await Promise.all(batch.map((item) => runWorker(item)));
    results.push(...batchResults);
  }

  return results;
}

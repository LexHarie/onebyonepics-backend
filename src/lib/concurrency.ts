const DEFAULT_CONCURRENCY = 5;

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

export function logFailedResults<T>(
  results: PromiseSettledResult<T>[],
  operation: string,
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

  console.error(message);
  if (aggregateError.stack) {
    console.error(aggregateError.stack);
  }

  return aggregateError;
}

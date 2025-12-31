export type HttpError = Error & {
  status?: number;
  code?: string;
  details?: Record<string, unknown>;
};

export const httpError = (
  status: number,
  message: string,
  options?: { code?: string; details?: Record<string, unknown> },
): HttpError => {
  const error = new Error(message) as HttpError;
  error.status = status;
  if (options?.code) {
    error.code = options.code;
  }
  if (options?.details) {
    error.details = options.details;
  }
  return error;
};

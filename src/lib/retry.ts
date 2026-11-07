// Retrying a busy or briefly unavailable API.

export interface RetryableError {
  status: number; // 0 for network errors
  retryAfterSeconds: number | null;
}

const MAX_RETRY_AFTER_S = 30;

/**
 * How long to wait before attempt `attempt` (1-based retry number), or null to give up.
 * 429: honour Retry-After (if it's reasonable). 5xx and network errors: exponential backoff with jitter.
 * Other 4xx (401, 404, 410...) won't get better by asking again.
 */
export function retryDelayMs(error: RetryableError, attempt: number, maxRetries = 3, random = Math.random): number | null {
  if (attempt > maxRetries) return null;
  if (error.status === 429) {
    const seconds = error.retryAfterSeconds ?? 2 ** attempt;
    return seconds <= MAX_RETRY_AFTER_S ? seconds * 1000 : null;
  }
  if (error.status === 0 || error.status >= 500) {
    return Math.round(500 * 2 ** (attempt - 1) * (0.75 + random() * 0.5));
  }
  return null;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

export async function withRetry<T>(
  task: () => Promise<T>,
  toRetryable: (error: unknown) => RetryableError | null,
  signal?: AbortSignal,
  wait: (ms: number, signal?: AbortSignal) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (signal?.aborted) throw error;
      const retryable = toRetryable(error);
      const delay = retryable ? retryDelayMs(retryable, attempt) : null;
      if (delay === null) throw error;
      await wait(delay, signal);
    }
  }
}

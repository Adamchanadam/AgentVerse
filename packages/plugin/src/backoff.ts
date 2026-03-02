const BASE_MS = 1000;
const MAX_MS = 60_000;

/**
 * Calculate exponential backoff delay.
 * @param attempt - Reconnection attempt number (1-based)
 * @param jitterFn - Optional jitter function. Defaults to random 0-10% of delay.
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, jitterFn?: () => number): number {
  const delay = Math.min(BASE_MS * Math.pow(2, attempt - 1), MAX_MS);
  const jitter = jitterFn ? jitterFn() : Math.random() * delay * 0.1;
  return Math.floor(delay + jitter);
}

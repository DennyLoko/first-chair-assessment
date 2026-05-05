export interface RetryOptions {
  timeoutMs: number;
}

function retryAfterMs(headers: Record<string, string | undefined> | Headers): number {
  const val =
    typeof headers.get === 'function'
      ? (headers as Headers).get('retry-after')
      : (headers as Record<string, string | undefined>)['retry-after'];
  if (!val) return 1000;
  const seconds = parseFloat(val);
  if (!isNaN(seconds)) return Math.min(seconds * 1000, 5000);
  const date = Date.parse(val);
  if (!isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 5000);
  return 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  const wrapped = (): Promise<T> => {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () =>
          reject(new Error(`Provider call timed out after ${opts.timeoutMs}ms`))
        )
      ),
    ]);
  };

  try {
    try {
      return await wrapped();
    } catch (err: unknown) {
      const e = err as {
        status?: number;
        headers?: Record<string, string> | Headers;
        message?: string;
      };

      const status = e?.status;

      if (status === 429) {
        const waitMs = e.headers ? retryAfterMs(e.headers as Record<string, string>) : 1000;
        await sleep(waitMs);
        return await wrapped();
      }

      if (status !== undefined && status >= 500) {
        await sleep(1000);
        return await wrapped();
      }

      // 4xx auth/quota — no retry
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

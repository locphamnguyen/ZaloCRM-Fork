/**
 * Proxy utility for Zalo SDK connections.
 * Sets HTTP_PROXY/HTTPS_PROXY env vars around SDK calls so zca-js
 * routes traffic through the configured proxy per-account.
 *
 * Uses a mutex to prevent env var race conditions when multiple
 * accounts connect concurrently.
 */

let locked = false;
const queue: Array<() => void> = [];

function acquireLock(): Promise<void> {
  return new Promise((resolve) => {
    if (!locked) {
      locked = true;
      resolve();
    } else {
      queue.push(resolve);
    }
  });
}

function releaseLock(): void {
  const next = queue.shift();
  if (next) {
    next();
  } else {
    locked = false;
  }
}

/**
 * Execute an async function with HTTP proxy env vars set.
 * If proxyUrl is null/undefined, runs fn() directly (no proxy).
 * Thread-safe via mutex for concurrent account operations.
 */
export async function withProxy<T>(proxyUrl: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  if (!proxyUrl) return fn();

  await acquireLock();
  const prevHttp = process.env.HTTP_PROXY;
  const prevHttps = process.env.HTTPS_PROXY;

  try {
    process.env.HTTP_PROXY = proxyUrl;
    process.env.HTTPS_PROXY = proxyUrl;
    return await fn();
  } finally {
    // Restore original env vars
    if (prevHttp !== undefined) process.env.HTTP_PROXY = prevHttp;
    else delete process.env.HTTP_PROXY;
    if (prevHttps !== undefined) process.env.HTTPS_PROXY = prevHttps;
    else delete process.env.HTTPS_PROXY;
    releaseLock();
  }
}

import { describe, expect, it } from "vitest";
import { retryDelayMs, withRetry, type RetryableError } from "./retry";

describe("retryDelayMs", () => {
  const half = () => 0.5;

  it("honours Retry-After on 429, but not absurd waits", () => {
    expect(retryDelayMs({ status: 429, retryAfterSeconds: 3 }, 1)).toBe(3000);
    expect(retryDelayMs({ status: 429, retryAfterSeconds: 120 }, 1)).toBeNull();
  });

  it("backs off exponentially on 5xx and network errors", () => {
    expect(retryDelayMs({ status: 503, retryAfterSeconds: null }, 1, 3, half)).toBe(500);
    expect(retryDelayMs({ status: 0, retryAfterSeconds: null }, 3, 3, half)).toBe(2000);
  });

  it("gives up on client errors and after the last attempt", () => {
    expect(retryDelayMs({ status: 401, retryAfterSeconds: null }, 1)).toBeNull();
    expect(retryDelayMs({ status: 410, retryAfterSeconds: null }, 1)).toBeNull();
    expect(retryDelayMs({ status: 503, retryAfterSeconds: null }, 4)).toBeNull();
  });
});

describe("withRetry", () => {
  const asRetryable = (e: unknown) => e as RetryableError;
  const noWait = async () => {};

  it("retries until it succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        if (++calls < 3) throw { status: 429, retryAfterSeconds: 1 };
        return "ok";
      },
      asRetryable,
      undefined,
      noWait,
    );
    expect([result, calls]).toEqual(["ok", 3]);
  });

  it("rethrows errors that retrying won't fix", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw { status: 404, retryAfterSeconds: null };
        },
        asRetryable,
        undefined,
        noWait,
      ),
    ).rejects.toEqual({ status: 404, retryAfterSeconds: null });
    expect(calls).toBe(1);
  });
});

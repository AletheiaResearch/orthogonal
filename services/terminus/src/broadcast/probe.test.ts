import { describe, expect, it, vi } from "vitest";

import { fetchWithTimeout } from "./probe";

const TEST_URL = "https://collector.example.com/probe";

describe("fetchWithTimeout", () => {
  it("forwards method, headers, and body to the underlying fetch", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = ((url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    await fetchWithTimeout(fetchImpl, TEST_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ test: true }),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(TEST_URL);
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>)["content-type"]).toBe(
      "application/json"
    );
    expect(calls[0].init?.body).toBe(JSON.stringify({ test: true }));
  });

  it("resolves with the response on success", async () => {
    const fetchImpl = ((_url, _init) =>
      Promise.resolve(new Response(null, { status: 200 }))) as typeof fetch;

    const response = await fetchWithTimeout(fetchImpl, TEST_URL, {});

    expect(response.status).toBe(200);
  });

  it("passes a non-null AbortSignal to the underlying fetch", async () => {
    let capturedSignal: AbortSignal | null | undefined = null;
    const fetchImpl = ((_url, init) => {
      capturedSignal = init?.signal;
      return Promise.resolve(new Response(null, { status: 200 }));
    }) as typeof fetch;

    await fetchWithTimeout(fetchImpl, TEST_URL, {});

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("aborts the signal after timeoutMs when the underlying fetch hangs", async () => {
    vi.useFakeTimers();
    try {
      let capturedSignal: AbortSignal | undefined;
      const fetchImpl = ((_url, init) =>
        new Promise<Response>((_, reject) => {
          capturedSignal = init!.signal!;
          capturedSignal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        })) as typeof fetch;

      const p = fetchWithTimeout(fetchImpl, TEST_URL, {}, 50);
      // Suppress the unhandled-rejection warning on the inner promise.
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(51);
      await expect(p).rejects.toThrow("aborted");
      expect(capturedSignal!.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

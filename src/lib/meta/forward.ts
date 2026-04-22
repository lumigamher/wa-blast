export async function forwardWebhook(
  fetchImpl: typeof fetch,
  url: string,
  body: string,
  headers: Record<string, string>,
  baseDelayMs = 1000,
): Promise<void> {
  const delays = [baseDelayMs, baseDelayMs * 3, baseDelayMs * 9];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json", "x-wa-blast-forward": "1" },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
      if (res.status < 500 && res.status !== 429) {
        console.warn(`forward: non-retryable ${res.status}`);
        return;
      }
    } catch (e) {
      console.warn("forward: network error", (e as Error).message);
    }
    if (attempt < delays.length) await new Promise((r) => setTimeout(r, delays[attempt]));
  }
  console.error("forward: exhausted retries");
}

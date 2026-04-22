import { describe, expect, test } from "vitest";
import { TokenBucket } from "@/lib/campaigns/rate-limit";

describe("TokenBucket", () => {
  test("allows rate msgs instantly, throttles on exceed", async () => {
    const bucket = new TokenBucket(5, 5);
    const start = Date.now();
    for (let i = 0; i < 5; i++) await bucket.take();
    const firstBatch = Date.now() - start;
    expect(firstBatch).toBeLessThan(50);

    await bucket.take();
    const afterSixth = Date.now() - start;
    expect(afterSixth).toBeGreaterThanOrEqual(180);
  });
});

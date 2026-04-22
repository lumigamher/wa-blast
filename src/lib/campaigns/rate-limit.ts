export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.last = Date.now();
  }

  async take(n = 1): Promise<void> {
    this.refill();
    if (this.tokens >= n) {
      this.tokens -= n;
      return;
    }
    const need = n - this.tokens;
    const waitMs = Math.ceil((need / this.refillPerSecond) * 1000);
    await new Promise((r) => setTimeout(r, waitMs));
    this.refill();
    this.tokens -= n;
  }

  private refill() {
    const now = Date.now();
    const delta = ((now - this.last) / 1000) * this.refillPerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + delta);
    this.last = now;
  }
}

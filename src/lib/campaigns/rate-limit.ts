export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private capacity: number,
    private refillPerSecond: number,
  ) {
    if (refillPerSecond <= 0 || capacity <= 0) {
      throw new Error(`TokenBucket mal configurado: capacity=${capacity}, refillPerSecond=${refillPerSecond}`);
    }
    this.tokens = capacity;
    this.last = Date.now();
  }

  async take(n = 1): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= n) {
        this.tokens -= n;
        return;
      }
      const need = n - this.tokens;
      await new Promise((r) => setTimeout(r, Math.ceil((need / this.refillPerSecond) * 1000)));
    }
  }

  private refill() {
    const now = Date.now();
    const delta = ((now - this.last) / 1000) * this.refillPerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + delta);
    this.last = now;
  }
}

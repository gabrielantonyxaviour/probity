// Counting semaphore with FIFO waiters. Used for the Nightshift cap (2 in flight, 05 §4.9).
export class Semaphore {
  private free: number;
  private readonly waiters: Array<() => void> = [];
  constructor(readonly capacity: number) {
    this.free = capacity;
  }
  async acquire(): Promise<() => void> {
    if (this.free > 0) this.free -= 1;
    else await new Promise<void>((resolve) => this.waiters.push(resolve));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.free += 1;
    };
  }
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
  get inFlight(): number {
    return this.capacity - this.free;
  }
}

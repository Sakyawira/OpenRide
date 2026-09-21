import type { RecoveryScheduler } from './ports';

export class IntervalRecoveryScheduler implements RecoveryScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  constructor(
    private readonly intervalMs: number,
    private readonly onError: (error: unknown) => void
  ) {}

  start(work: () => Promise<void>): void {
    if (this.timer) throw new Error('Recovery scheduler is already started.');
    this.timer = setInterval(() => {
      void this.run(work);
    }, this.intervalMs);
    void this.run(work);
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.pending) return;
    this.pending = work();
    try {
      await this.pending;
    } catch (error) {
      this.onError(error);
    } finally {
      this.pending = undefined;
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    // run() reports errors; shutdown must still close the repository afterwards.
    if (this.pending) await Promise.allSettled([this.pending]);
  }
}

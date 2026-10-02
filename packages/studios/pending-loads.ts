/** Shares in-flight work without caching failures or retaining resolved tasks. */
export class PendingLoads {
  private pending = new Map<string, Promise<void>>();

  run(key: string, load: () => Promise<void>): Promise<void> {
    const current = this.pending.get(key);
    if (current) return current;
    const next = Promise.resolve().then(load).finally(() => this.pending.delete(key));
    this.pending.set(key, next);
    return next;
  }
}

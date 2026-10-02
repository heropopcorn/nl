import { describe, expect, it, vi } from 'vitest';
import { PendingLoads } from '../packages/studios/pending-loads';

describe('shared in-flight resource loads', () => {
  it('coalesces concurrent requests for the same source', async () => {
    const loads = new PendingLoads(), load = vi.fn(async () => {});
    const first = loads.run('image:shared', load), second = loads.run('image:shared', load);
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(load).toHaveBeenCalledTimes(1);
    // Loaded data belongs to the caller; the queue must not retain promises.
    await loads.run('image:shared', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('allows a failed source to be retried without disturbing other resources', async () => {
    const loads = new PendingLoads();
    const failed = loads.run('image:one', async () => { throw new Error('decode failed'); });
    const other = vi.fn(async () => {});
    const second = loads.run('texture:one', other);
    await expect(failed).rejects.toThrow('decode failed'); await second;
    const retry = vi.fn(async () => {});
    await loads.run('image:one', retry);
    expect(retry).toHaveBeenCalledTimes(1); expect(other).toHaveBeenCalledTimes(1);
  });

  it('captures synchronous loader exceptions and clears them for retry', async () => {
    const loads = new PendingLoads();
    await expect(loads.run('source', () => { throw new Error('sync'); })).rejects.toThrow('sync');
    await expect(loads.run('source', async () => {})).resolves.toBeUndefined();
  });
});

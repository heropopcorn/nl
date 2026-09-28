import { describe, expect, it } from 'vitest';
import { splashShape } from '../packages/studios/rain-splash';

const mark = { splash: 0, size: 1, landingX: 400, landingY: 500 };
describe('rain impact shape', () => {
  it('starts with a brief impact and ends completely transparent', () => {
    expect(splashShape(mark).impact).toBeGreaterThan(0);
    const end = splashShape({ ...mark, splash: 1 });
    expect(end.impact).toBe(0); expect(end.alpha).toBe(0);
    expect(end.droplets.every(d => d.alpha === 0)).toBe(true);
  });
  it('throws droplets up and out, then lets them fall back', () => {
    const early = splashShape({ ...mark, splash: 0.15 });
    const late = splashShape({ ...mark, splash: 0.6 });
    expect(early.droplets.every(d => d.y < 0)).toBe(true);
    expect(late.droplets[0].y).toBeGreaterThan(early.droplets[0].y);
    expect(Math.abs(late.droplets[0].x)).toBeGreaterThan(Math.abs(early.droplets[0].x));
    expect(late.radius).toBeGreaterThan(early.radius);
  });
  it('is deterministic and varies between landing positions', () => {
    expect(splashShape(mark)).toEqual(splashShape(mark));
    expect(splashShape(mark)).not.toEqual(splashShape({ ...mark, landingX: 401 }));
  });
});

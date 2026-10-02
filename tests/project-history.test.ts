import { describe, expect, it } from 'vitest';
import { sample, type Project } from '../packages/core';
import { ProjectHistory } from '../apps/director-web/src/project-history';

const fresh = () => structuredClone(sample);

describe('project document transactions and undo history', () => {
  it('groups one continuous input into one undo step and preserves redo', () => {
    const history = new ProjectHistory(fresh());
    const before = history.current.shots[0].name;
    for (const name of ['村', '村庄', '村庄夜晚']) history.edit(p => { p.shots[0].name = name; }, 'name-input');
    expect(history.canUndo).toBe(true);
    expect(history.travel(true)).toBe(true);
    expect(history.current.shots[0].name).toBe(before);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
    history.travel(false);
    expect(history.current.shots[0].name).toBe('村庄夜晚');
  });

  it('separates focus sessions, other input controls and ungrouped actions', () => {
    const history = new ProjectHistory(fresh());
    history.edit(p => { p.shots[0].name = '第一次'; }, 'name');
    history.endGroup();
    history.edit(p => { p.shots[0].name = '第二次'; }, 'name');
    history.edit(p => { p.shots[0].frames = 200; }, 'duration');
    history.edit(p => { p.shots[0].frames = 220; }, 'duration');
    history.edit(p => { p.shots[0].actors[0].name = '角色'; });
    history.travel(true);
    expect(history.current.shots[0].frames).toBe(220);
    history.travel(true);
    expect(history.current.shots[0].frames).toBe(sample.shots[0].frames);
    expect(history.current.shots[0].name).toBe('第二次');
    history.travel(true);
    expect(history.current.shots[0].name).toBe('第一次');
  });

  it('does not consume history or clear redo for no-op changes', () => {
    const history = new ProjectHistory(fresh());
    expect(history.edit(() => {})).toBe(false);
    expect(history.replace(fresh())).toBe(false);
    expect(history.canUndo).toBe(false);
    history.edit(p => { p.shots[0].name = '修改'; });
    history.travel(true);
    expect(history.edit(p => { p.shots[0].name = sample.shots[0].name; })).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);
  });

  it('keeps failed transactions atomic, including mutations made before a thrown error', () => {
    const history = new ProjectHistory(fresh());
    const original = history.current;
    expect(() => history.edit(p => { p.shots[0].name = '不能留下'; throw new Error('中断'); })).toThrow('中断');
    expect(history.current).toBe(original);
    expect(history.current).toEqual(sample);
    expect(history.canUndo).toBe(false);
    expect(() => history.edit(p => { p.shots[0].frames = 0; })).toThrow();
    expect(history.current).toBe(original);
    expect(history.canUndo).toBe(false);
    history.edit(p => { p.shots[0].name = '合法'; });
    history.travel(true);
    expect(() => history.replace({ ...fresh(), shots: [] } as Project)).toThrow();
    expect(history.canRedo).toBe(true);
  });

  it('drops the empty undo entry when one gesture returns to its starting value', () => {
    const history = new ProjectHistory(fresh());
    history.edit(p => { p.shots[0].actors[0].scale = 2; }, 'scale');
    history.edit(p => { p.shots[0].actors[0].scale = 1; }, 'scale');
    expect(history.canUndo).toBe(false);
    history.edit(p => { p.shots[0].actors[0].scale = 3; }, 'scale');
    history.travel(true);
    expect(history.current.shots[0].actors[0].scale).toBe(1);
  });

  it('applies delayed resource callbacks to the latest project without dropping intervening edits', async () => {
    const history = new ProjectHistory(fresh());
    const staleShot = history.current.shots[0];
    const placeResource = async (id: string) => {
      await Promise.resolve();
      history.edit(p => {
        p.shots.find(shot => shot.id === staleShot.id)!.actors.push({ ...structuredClone(staleShot.actors[0]), id, name: id });
      });
    };
    const first = placeResource('first');
    history.edit(p => { p.shots[0].name = '资源解码期间的修改'; });
    const second = placeResource('second');
    await Promise.all([first, second]);
    expect(history.current.shots[0].name).toBe('资源解码期间的修改');
    expect(history.current.shots[0].actors.map(actor => actor.id)).toEqual([sample.shots[0].actors[0].id, 'first', 'second']);
    history.travel(true);
    expect(history.current.shots[0].actors.map(actor => actor.id)).toEqual([sample.shots[0].actors[0].id, 'first']);
  });

  it('branches cleanly after undo and bounds retained transactions', () => {
    const history = new ProjectHistory(fresh(), 2);
    for (const name of ['A', 'B', 'C']) history.edit(p => { p.shots[0].name = name; });
    history.travel(true);
    history.travel(true);
    expect(history.current.shots[0].name).toBe('A');
    expect(history.travel(true)).toBe(false);
    history.edit(p => { p.shots[0].name = '新分支'; });
    expect(history.canRedo).toBe(false);
    expect(history.travel(false)).toBe(false);
  });

  it('hydrates without creating undo history or retaining history from another document', () => {
    const history = new ProjectHistory(fresh());
    history.edit(p => { p.shots[0].name = '旧文档'; });
    history.travel(true);
    const next = fresh(); next.shots[0].name = '恢复文档';
    history.hydrate(next);
    expect(history.current).toEqual(next);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});

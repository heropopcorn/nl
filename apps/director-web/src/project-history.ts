import { projectSchema, type Project } from '../../../packages/core';

/** Transactions always start from the latest document, including async callbacks. */
export class ProjectHistory {
  private past: Project[] = [];
  private future: Project[] = [];
  private group: string | undefined;
  constructor(public current: Project, private limit = 80) {}
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  edit(change: (project: Project) => void, group?: string) {
    const next = structuredClone(this.current);
    change(next);
    return this.replace(next, group);
  }
  replace(next: Project, group?: string) {
    const valid = projectSchema.parse(next);
    const json = JSON.stringify(valid);
    // Clicking an already selected value must not consume undo history.
    if (json === JSON.stringify(this.current)) return false;
    // Dragging back to the original value cancels this interaction's history.
    if (group && group === this.group && this.past.length && json === JSON.stringify(this.past.at(-1))) {
      this.past.pop(); this.future = []; this.group = undefined; this.current = valid;
      return true;
    }
    if (!group || group !== this.group) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = []; this.group = group; this.current = valid;
    return true;
  }
  travel(back: boolean) {
    const from = back ? this.past : this.future, to = back ? this.future : this.past;
    const next = from.pop(); if (!next) return false;
    to.push(this.current); this.current = next; this.group = undefined;
    return true;
  }
  hydrate(next: Project) { this.current = next; this.past = []; this.future = []; this.group = undefined; }
  endGroup() { this.group = undefined; }
}

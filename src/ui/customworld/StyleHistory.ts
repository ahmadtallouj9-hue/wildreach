/**
 * Undo/redo over world-style configurations.
 *
 * Only the configuration is recorded — never generated terrain — so history is
 * tiny and stepping through it is instant. Consecutive edits to the same
 * parameter coalesce, so dragging a slider produces one undo step rather than
 * one per pixel of travel.
 */
import { cloneStyle, type VytheraWorldStyle } from '../../world/style/WorldStyle';

const MAX_ENTRIES = 60;
/** Edits to the same field within this window collapse into one step. */
const COALESCE_MS = 700;

interface Entry {
  style: VytheraWorldStyle;
  tag: string;
  at: number;
}

export class StyleHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private current: Entry;

  constructor(initial: VytheraWorldStyle) {
    this.current = { style: cloneStyle(initial), tag: 'init', at: 0 };
  }

  get style(): VytheraWorldStyle {
    return this.current.style;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /**
   * Record a new configuration. `tag` identifies the edited control so repeated
   * changes to the same one can coalesce.
   */
  push(style: VytheraWorldStyle, tag: string): void {
    const now = Date.now();
    const coalesce =
      tag !== 'init' && this.current.tag === tag && now - this.current.at < COALESCE_MS;

    if (!coalesce) {
      this.past.push(this.current);
      if (this.past.length > MAX_ENTRIES) this.past.shift();
    }
    this.future = [];
    this.current = { style: cloneStyle(style), tag, at: now };
  }

  /** Replace the current state without creating a history step. */
  replace(style: VytheraWorldStyle): void {
    this.current = { ...this.current, style: cloneStyle(style) };
  }

  undo(): VytheraWorldStyle | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(this.current);
    this.current = prev;
    return this.current.style;
  }

  redo(): VytheraWorldStyle | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(this.current);
    this.current = next;
    return this.current.style;
  }

  reset(style: VytheraWorldStyle): void {
    this.past = [];
    this.future = [];
    this.current = { style: cloneStyle(style), tag: 'init', at: 0 };
  }
}

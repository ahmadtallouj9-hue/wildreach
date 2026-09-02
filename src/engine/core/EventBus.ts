type Handler<T> = (payload: T) => void;

/**
 * Minimal typed event bus. Events are declared as a map of name → payload:
 *
 *   interface GameEvents { 'world:loaded': { seed: string }; tick: number }
 *   const bus = new EventBus<GameEvents>();
 *
 * No stringly-typed escape hatch: unknown event names fail at compile time.
 */
export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  once<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    const wrap: Handler<Events[K]> = (payload) => {
      this.off(type, wrap);
      handler(payload);
    };
    return this.on(type, wrap);
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    const set = this.handlers.get(type);
    if (!set) return;
    set.delete(handler as Handler<never>);
    if (set.size === 0) this.handlers.delete(type);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    // Copy: handlers may unsubscribe during dispatch.
    for (const handler of [...set]) (handler as Handler<Events[K]>)(payload);
  }

  listenerCount<K extends keyof Events>(type: K): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}

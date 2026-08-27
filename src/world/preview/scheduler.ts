/**
 * Cooperative yielding for long preview builds.
 *
 * A build has to hand control back so the tab stays responsive, but yielding
 * through requestAnimationFrame makes every yield cost a full render of the
 * scene — and renders are slowest on exactly the heavy scenes that need the
 * most yields. A 3.9M-triangle preview spent seconds waiting to be resumed for
 * work that takes tens of milliseconds.
 *
 * So most yields go through a message-channel macrotask, which returns almost
 * immediately, and a frame is only awaited occasionally so progress text still
 * paints. The build stays interruptible either way.
 */

/** How often a yield should be a real frame, so the interface repaints. */
const PAINT_INTERVAL_MS = 200;

function macrotask(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(null);
  });
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/**
 * Yields control, painting only when a paint is due.
 *
 * Callers keep their own `lastPaint` timestamp and pass it in; the returned
 * value is the timestamp to carry forward.
 */
export async function yieldToBrowser(lastPaint: number): Promise<number> {
  if (performance.now() - lastPaint >= PAINT_INTERVAL_MS) {
    await frame();
    return performance.now();
  }
  await macrotask();
  return lastPaint;
}

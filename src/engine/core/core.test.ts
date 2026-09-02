import assert from 'node:assert/strict';
import { EventBus } from './EventBus';
import { FixedTimestep } from './FixedTimestep';

interface TestEvents {
  'chunk:loaded': { cx: number; cz: number };
  tick: number;
}

function testOnEmitOff(): void {
  const bus = new EventBus<TestEvents>();
  const seen: number[] = [];
  const unsub = bus.on('tick', (n) => seen.push(n));
  bus.emit('tick', 1);
  bus.emit('tick', 2);
  assert.deepEqual(seen, [1, 2]);
  unsub();
  bus.emit('tick', 3);
  assert.deepEqual(seen, [1, 2]);
  assert.equal(bus.listenerCount('tick'), 0);
}

function testOnce(): void {
  const bus = new EventBus<TestEvents>();
  let calls = 0;
  bus.once('chunk:loaded', ({ cx, cz }) => {
    calls++;
    assert.equal(cx, 2);
    assert.equal(cz, -3);
  });
  bus.emit('chunk:loaded', { cx: 2, cz: -3 });
  bus.emit('chunk:loaded', { cx: 2, cz: -3 });
  assert.equal(calls, 1);
}

function testUnsubscribeDuringDispatch(): void {
  const bus = new EventBus<TestEvents>();
  const calls: string[] = [];
  const a = (): void => {
    calls.push('a');
    bus.off('tick', b);
  };
  const b = (): void => {
    calls.push('b');
  };
  bus.on('tick', a);
  bus.on('tick', b);
  bus.emit('tick', 0); // both run: dispatch iterates a copy
  bus.emit('tick', 0); // b removed
  assert.deepEqual(calls, ['a', 'b', 'a']);
}

function testFixedStepCounts(): void {
  const ts = new FixedTimestep(0.05);
  // 60 FPS frame time → not quite one step per frame.
  ts.addTime(1 / 60);
  assert.equal(ts.hasStep(), false);
  ts.addTime(1 / 60);
  ts.addTime(1 / 60);
  assert.equal(ts.hasStep(), true); // 0.05 accumulated
  ts.consumeStep();
  assert.equal(ts.hasStep(), false);
  assert(Math.abs(ts.alpha) < 1e-9);
}

function testFixedStepBurst(): void {
  const ts = new FixedTimestep(0.05);
  ts.addTime(0.2); // exactly 4 steps
  let steps = 0;
  while (ts.hasStep()) {
    steps++;
    ts.consumeStep();
  }
  assert.equal(steps, 4);
  assert(Math.abs(ts.alpha) < 1e-9); // float residue, not a real remainder
}

function testClampBoundsCatchup(): void {
  const ts = new FixedTimestep(0.05, 0.25);
  ts.addTime(10); // tab was hidden for 10 s
  let steps = 0;
  while (ts.hasStep()) {
    steps++;
    ts.consumeStep();
  }
  assert.equal(steps, 5); // 0.25 / 0.05, not 200
}

function testAlphaInterpolation(): void {
  const ts = new FixedTimestep(0.05);
  ts.addTime(0.075);
  ts.consumeStep();
  assert(Math.abs(ts.alpha - 0.5) < 1e-9);
}

function testRejectsBadInput(): void {
  const ts = new FixedTimestep(0.05);
  ts.addTime(NaN);
  ts.addTime(-1);
  ts.addTime(Infinity);
  assert.equal(ts.pending, 0);
  assert.throws(() => new FixedTimestep(0));
  assert.throws(() => new FixedTimestep(0.05, 0.01));
}

testOnEmitOff();
testOnce();
testUnsubscribeDuringDispatch();
testFixedStepCounts();
testFixedStepBurst();
testClampBoundsCatchup();
testAlphaInterpolation();
testRejectsBadInput();
console.log('engine core tests: ok');

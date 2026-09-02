import assert from 'node:assert/strict';
import { Logger, createLogger, type LogEntry, type LogSink } from './Logger';
import { Profiler } from './Profiler';

function testLoggerLevelsAndSinks(): void {
  const received: LogEntry[] = [];
  const sink: LogSink = (e) => received.push(e);
  Logger.addSink(sink);
  Logger.setMinLevel('warn');
  try {
    const log = createLogger('test');
    log.debug('hidden');
    log.info('hidden too');
    log.warn('shown', { a: 1 });
    log.error('also shown');
    assert.equal(received.length, 2);
    assert.equal(received[0]!.message, 'shown');
    assert.equal(received[0]!.tag, 'test');
    assert.deepEqual(received[0]!.data, { a: 1 });
    assert.equal(received[1]!.level, 'error');
  } finally {
    Logger.removeSink(sink);
    Logger.setMinLevel('info');
    Logger.clearHistory();
  }
}

function testLoggerRingBuffer(): void {
  Logger.clearHistory();
  const silent: LogSink = () => {};
  Logger.addSink(silent);
  const log = createLogger('ring');
  for (let i = 0; i < 600; i++) log.info(`m${i}`);
  const history = Logger.history();
  assert.equal(history.length, 500);
  assert.equal(history[history.length - 1]!.message, 'm599');
  assert.equal(history[0]!.message, 'm100');
  Logger.removeSink(silent);
  Logger.clearHistory();
}

function testProfilerStats(): void {
  const p = new Profiler(10);
  for (const v of [1, 2, 3, 4, 5]) p.record('frame', v);
  const s = p.stats('frame');
  assert(s);
  assert.equal(s.count, 5);
  assert.equal(s.avg, 3);
  assert.equal(s.min, 1);
  assert.equal(s.max, 5);
  assert.equal(s.last, 5);
}

function testProfilerRollingWindow(): void {
  const p = new Profiler(3);
  for (const v of [1, 2, 3, 4, 5]) p.record('m', v);
  const s = p.stats('m');
  assert(s);
  assert.equal(s.count, 3);
  assert.equal(s.avg, 4); // window holds [3,4,5]
  assert.equal(s.last, 5);
}

function testProfilerMeasure(): void {
  const p = new Profiler();
  const end = p.begin('section');
  end();
  end(); // idempotent
  const s = p.stats('section');
  assert(s);
  assert.equal(s.count, 1);
  assert(s.last >= 0);

  const result = p.measure('fn', () => 42);
  assert.equal(result, 42);
  assert.equal(p.stats('fn')!.count, 1);

  assert.equal(p.stats('missing'), null);
  assert.deepEqual(Object.keys(p.snapshot()).sort(), ['fn', 'section']);
}

testLoggerLevelsAndSinks();
testLoggerRingBuffer();
testProfilerStats();
testProfilerRollingWindow();
testProfilerMeasure();
console.log('engine logger/profiler tests: ok');

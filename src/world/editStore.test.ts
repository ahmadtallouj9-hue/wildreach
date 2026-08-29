import assert from 'node:assert/strict';
import { decodeEdits, encodeEdits } from './editStore';

const map = new Map<string, number>([
  ['1,2,3', 5],
  ['-4,10,8', 0],
  ['0,48,0', 16],
]);

const round = decodeEdits(encodeEdits(map));
assert.equal(round.size, 3);
assert.equal(round.get('1,2,3'), 5);
assert.equal(round.get('-4,10,8'), 0);
assert.equal(round.get('0,48,0'), 16);
assert.equal(decodeEdits('').size, 0);
assert.equal(decodeEdits('bad').size, 0);
console.log('editStore.test.ts: ok');

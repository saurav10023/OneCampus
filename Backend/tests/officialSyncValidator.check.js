import assert from 'node:assert/strict';
import { validateUpdatesQuery } from '../src/validators/officialSync.validator.js';
let n = 0;
const test = (name, fn) => { fn(); n += 1; console.log('ok', n, name); };
const run = (q) => { const req = { query: q }; try { validateUpdatesQuery(req, {}, () => {}); return { ok: true, out: req.validatedQuery }; } catch (e) { return { ok: false, status: e.statusCode }; } };
test('defaults', () => assert.deepEqual(run({}).out, { status: 'all', limit: 50 }));
test('valid filters', () => assert.deepEqual(run({ status: 'pending', limit: '20' }).out, { status: 'pending', limit: 20 }));
test('bad status, limit', () => {
  for (const q of [{ status: 'x' }, { limit: '0' }, { limit: '101' }, { limit: '1.5' }, { limit: '' }, { limit: 'abc' }]) assert.equal(run(q).status, 400, JSON.stringify(q));
});
console.log(`\nall ${n} passed`);
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/serviceJobs.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const { orderJobs, firstPendingPerContract } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// --- the code this module replaced, copied verbatim, used as the oracle ------------------------------------------
const oldOrder = (jobs, dateOf) => jobs.slice().sort((a, b) => Number(a.month.done) - Number(b.month.done) || dateOf(a).localeCompare(dateOf(b)));
const oldFirstPending = (jobs) => jobs.filter((job, index, all) => !job.month.done && all.findIndex((candidate) => candidate.contract.id === job.contract.id && !candidate.month.done) === index);

// small deterministic random generator so a failure is reproducible
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

const makeJobs = (random, contracts, monthsPerContract) => {
  const jobs = [];
  for (let c = 0; c < contracts; c++) {
    for (let m = 1; m <= monthsPerContract; m++) {
      const roll = random();
      // mostly canonical «YYYY/MM/DD»; a few odd keys (what jobDate falls back to) keep the locale comparison honest
      const date = roll < 0.9
        ? `${1403 + Math.floor(random() * 3)}/${String(1 + Math.floor(random() * 12)).padStart(2, '0')}/${String(1 + Math.floor(random() * 28)).padStart(2, '0')}`
        : roll < 0.95 ? `undefined/${String(m).padStart(2, '0')}/01` : `${1404}/${m}/3`;
      jobs.push({ seq: jobs.length, contract: { id: 1000 + c }, month: { id: m, done: random() < 0.4, date } });
    }
  }
  return jobs;
};
const dateOf = (job) => job.month.date;
const asEntries = (jobs) => jobs.map((job) => ({ job, done: !!job.month.done, date: dateOf(job) }));

test('orderJobs gives exactly the order of the old comparator (pending first, then date, stable) on random data', () => {
  for (const [seed, contracts, months] of [[1, 5, 4], [2, 40, 12], [3, 300, 12], [4, 3, 1], [5, 120, 12]]) {
    const jobs = makeJobs(rng(seed), contracts, months);
    const expected = oldOrder(jobs, dateOf).map((job) => job.seq);
    const actual = orderJobs(asEntries(jobs)).map((job) => job.seq);
    assert.deepEqual(actual, expected, `seed ${seed}`);
  }
});

test('orderJobs is stable: jobs with the same state and date keep their input order', () => {
  const jobs = Array.from({ length: 50 }, (_, i) => ({ seq: i, contract: { id: i }, month: { id: 1, done: i % 2 === 0, date: '1405/06/26' } }));
  assert.deepEqual(orderJobs(asEntries(jobs)).map((job) => job.seq), [...jobs.filter((j) => !j.month.done), ...jobs.filter((j) => j.month.done)].map((j) => j.seq));
});

test('orderJobs puts pending jobs first even when their date is later', () => {
  const late = { seq: 0, contract: { id: 1 }, month: { id: 1, done: false, date: '1406/12/29' } };
  const early = { seq: 1, contract: { id: 2 }, month: { id: 1, done: true, date: '1403/01/01' } };
  assert.deepEqual(orderJobs(asEntries([early, late])).map((job) => job.seq), [0, 1]);
});

test('orderJobs does not modify its input and handles an empty list', () => {
  const entries = asEntries(makeJobs(rng(9), 10, 3));
  const before = entries.map((entry) => entry.job.seq);
  orderJobs(entries);
  assert.deepEqual(entries.map((entry) => entry.job.seq), before);
  assert.deepEqual(orderJobs([]), []);
});

test('firstPendingPerContract equals the old nested-findIndex selection on random data', () => {
  for (const [seed, contracts, months] of [[11, 8, 6], [12, 200, 12], [13, 1, 12], [14, 60, 2]]) {
    const ordered = orderJobs(asEntries(makeJobs(rng(seed), contracts, months)));
    assert.deepEqual(firstPendingPerContract(ordered).map((job) => job.seq), oldFirstPending(ordered).map((job) => job.seq), `seed ${seed}`);
  }
});

test('firstPendingPerContract: one entry per contract, the first pending one, nothing for fully finished contracts', () => {
  const job = (seq, id, done) => ({ seq, contract: { id }, month: { id: seq, done } });
  const list = [job(0, 1, true), job(1, 1, false), job(2, 1, false), job(3, 2, true), job(4, 3, false), job(5, 2, true)];
  assert.deepEqual(firstPendingPerContract(list).map((j) => j.seq), [1, 4]);
  assert.deepEqual(firstPendingPerContract([]), []);
});

test('the new code is linear: 18,000 jobs (a 1,500-contract fleet) are ordered and reduced in milliseconds', () => {
  const jobs = makeJobs(rng(21), 1500, 12);      // 18,000 jobs = the 1,500-contract fleet
  const start = performance.now();
  const ordered = orderJobs(asEntries(jobs));
  const picked = firstPendingPerContract(ordered);
  const elapsed = performance.now() - start;
  assert.ok(picked.length <= 1500);
  assert.ok(elapsed < 400, `took ${elapsed.toFixed(0)} ms`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/activeServices.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const { personKey, sameTechnician, normalizeActiveAssignments, mergeActiveAssignments } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const item = (contractId, technicianName, startedAt, monthId = 1) => ({ contractId, monthId, technicianName, startedAt, buildingName: `B${contractId}` });

test('the same person is recognised across half-space, Arabic letters and extra spaces', () => {
  assert.equal(personKey('محمد  حسن رحیمی‌زاده '), personKey('محمد حسن رحیمی زاده'));
  assert.equal(personKey('علي'), personKey('علی'));
  assert.equal(personKey('كامران'), personKey('کامران'));
  assert.ok(sameTechnician('محمد حسن رحیمی‌زاده', 'محمد حسن رحیمی زاده'));
  assert.ok(!sameTechnician('علی', 'رضا'));
  assert.ok(!sameTechnician('', ''), 'empty names are never "the same person"');
});

test('one in-progress service per person: the newest start wins, other people are untouched', () => {
  const list = [item(1, 'الف', 100), item(2, 'الف', 300), item(3, 'الف', 200), item(4, 'ب', 50)];
  const result = normalizeActiveAssignments(list);
  assert.deepEqual(result.map(x => x.contractId), [2, 4]);
  assert.equal(result.find(x => x.technicianName === 'ب').startedAt, 50);
});

test('one executor per service: the newest wins; the same person in two spellings counts once', () => {
  const sameService = normalizeActiveAssignments([item(1, 'الف', 100), item(1, 'ب', 200)]);
  assert.deepEqual(sameService.map(x => x.technicianName), ['ب']);
  const spellings = normalizeActiveAssignments([item(1, 'محمد رحیمی‌زاده', 100), item(2, 'محمد رحیمی زاده', 200)]);
  assert.deepEqual(spellings.map(x => x.contractId), [2]);
});

test('a clean list is returned unchanged (same array, stable for React); invalid input becomes an empty list', () => {
  const clean = [item(1, 'الف', 100), item(2, 'ب', 200)];
  assert.equal(normalizeActiveAssignments(clean), clean);
  assert.deepEqual(normalizeActiveAssignments(null), []);
  assert.deepEqual(normalizeActiveAssignments({ not: 'a list' }), []);
  assert.deepEqual(normalizeActiveAssignments([null, 5, item(1, 'الف', 1)]).map(x => x.contractId), [1]);
});

test('equal start times: the later entry (the local copy in a merge) wins', () => {
  const merged = mergeActiveAssignments([item(1, 'الف', 500)], [item(2, 'الف', 500)]);
  assert.deepEqual(merged.map(x => x.contractId), [2]);
});

test('merging two devices keeps everybody, but never two services for one person', () => {
  const server = [item(1, 'الف', 100), item(7, 'ج', 120)];
  const local = [item(2, 'الف', 400), item(8, 'د', 410)];
  const merged = mergeActiveAssignments(server, local);
  assert.deepEqual(merged.map(x => x.contractId).sort(), [2, 7, 8]);
  assert.equal(merged.filter(x => x.technicianName === 'الف').length, 1);
  assert.deepEqual(mergeActiveAssignments(undefined, [item(3, 'الف', 1)]).map(x => x.contractId), [3]);
  assert.deepEqual(mergeActiveAssignments([item(3, 'الف', 1)], null).map(x => x.contractId), [3]);
});

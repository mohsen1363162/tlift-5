import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
const compiled = buildSync({ entryPoints: ['src/utils/materialCatalog.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const { planMaterialImport, findMaterialEntry, matchesPartSearch, sameReviewedMaterial } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const data = buildSync({ entryPoints: ['src/data/materialCatalog.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const { MATERIAL_CATALOG, MATERIAL_SOURCE_COUNT } = await import(`data:text/javascript;base64,${Buffer.from(data).toString('base64')}`);
const part = (id, code, name, price, extra = {}) => ({ id, code, name, price, unit: 'عدد', stock: 0, minimumStock: 0, alias: '', brand: '', country: '', desc: '', consumable: true, ...extra });

test('all 130 rows are represented once in 108 reviewed items; each group uses the maximum rial price', () => {
  assert.equal(MATERIAL_SOURCE_COUNT, 130);
  assert.equal(MATERIAL_CATALOG.length, 108);
  const rows = MATERIAL_CATALOG.flatMap(e => e.sources);
  assert.equal(rows.length, 130);
  assert.equal(new Set(rows.map(r => r.code)).size, 130);
  assert.equal(MATERIAL_CATALOG.filter(e => e.sources.length > 1).length, 8);
  for (const entry of MATERIAL_CATALOG) {
    assert.equal(entry.price, Math.max(...entry.sources.map(row => row.price)));
    assert.equal(new Set(entry.sources.map(row => row.unit)).size, 1);
    assert.ok(entry.sources.some(row => row.code === entry.code && row.price === entry.price));
  }
});

test('known edited synonyms select higher prices and preserve all original codes for search', () => {
  const { records } = planMaterialImport([]);
  for (const [oldCode, name, price] of [
    ['458796', 'هزینه نظافت کامل آسانسور', 5000000], ['29420', 'لامپ ۱۰ وات', 1300000],
    ['29454', 'قفل درب طبقه', 25000000], ['29759', 'برد سر درب آسانسور یاران', 55000000],
    ['33403', 'سرویس ماهیانه آسانسور', 2500000],
  ]) {
    const entry = records.find(p => p.name === name);
    assert.equal(entry.price, price);
    assert.ok(matchesPartSearch(entry, oldCode));
  }
});

test('units, brands, wattage, quantities and service periods are not fuzzy merged', () => {
  const { records } = planMaterialImport([]);
  for (const code of ['1','29339','45158','29364','31119','41079','49921','29779','29964','41039','51353','52604','61499','61500','31012','57580']) {
    assert.ok(records.some(p => p.code === code), code);
  }
  assert.equal(sameReviewedMaterial({ name: 'روغن دو زمانه', unit: 'عدد' }, { name: 'روغن دو زمانه', unit: 'لیتر' }), false);
  assert.equal(findMaterialEntry({ name: 'کنتاکتور 40 آمپر', unit: 'عدد' }), undefined);
  assert.equal(findMaterialEntry({ name: 'لامپ 10 وات', unit: 'عدد', brand: 'برند متفاوت' }), undefined);
});

test('migration preserves IDs, stock, notes and higher current prices; reapplying is a no-op', () => {
  const current = [part(9000, '2', 'دستمزد نصب تابلو', 60000000, { stock: 7, desc: 'keep me', minimumStock: 2 }),
    part(6, '4587', 'هزینه نظافت کامل آسانسور 2', 2000000), part(8, '29039', 'هزینه نظافت کامل آسانسور', 3000000),
    part(99, 'CUSTOM', 'قطعه سفارشی متفاوت', 12, { stock: 3 })];
  const before = structuredClone(current);
  const first = planMaterialImport(current);
  assert.deepEqual(current, before);
  assert.equal(first.records.find(p => p.id === 9000).price, 60000000);
  assert.equal(first.records.find(p => p.id === 9000).stock, 7);
  assert.equal(first.records.find(p => p.id === 9000).desc, 'keep me');
  assert.equal(first.records.find(p => p.id === 6).mergedInto, 8);
  assert.deepEqual(first.records.find(p => p.id === 99), before[3]);
  assert.equal(first.records.find(p => p.id === 8).price, 5000000);
  const second = planMaterialImport(first.records);
  assert.equal(second.added + second.updated + second.archived, 0);
  assert.deepEqual(second.records, first.records);
  assert.equal(new Set(first.records.map(p => p.id)).size, first.records.length);
});

test('duplicate inventory is not guessed or summed, even if both names match', () => {
  const current = [part(1, '29454', 'قفل درب طبقه', 15000000, { stock: 2 }), part(2, '29756', 'قفل طبقه', 25000000, { stock: 4 })];
  const plan = planMaterialImport(current);
  assert.equal(plan.records.find(p => p.id === 1).stock, 2);
  assert.equal(plan.records.find(p => p.id === 2).stock, 4);
  assert.equal(plan.records.find(p => p.id === 1).mergedInto, undefined);
  assert.ok(plan.warnings.some(w => w.includes('انبارگردانی')));
});

test('reused code with different specifications is reported instead of overwritten', () => {
  const current = [part(1, '29364', 'لامپ خاص 60 وات', 5000000)];
  const plan = planMaterialImport(current);
  assert.deepEqual(plan.records.find(p => p.id === 1), current[0]);
  assert.equal(plan.records.filter(p => p.code === '29364').length, 1);
  assert.ok(plan.warnings.some(w => w.includes('29364')));
});

test('old delivery aliases match only the reviewed equivalent and same unit', () => {
  assert.ok(sameReviewedMaterial({ name: 'قفل طبقه', code: '29756', unit: 'عدد' }, { name: 'قفل درب طبقه', code: '29454', unit: 'عدد' }));
  assert.equal(sameReviewedMaterial({ name: 'قفل درب', unit: 'عدد' }, { name: 'قفل درب طبقه', unit: 'عدد' }), false);
  assert.equal(sameReviewedMaterial({ name: 'فتیله', unit: 'متر' }, { name: 'فتیله', unit: 'عدد' }), false);
});

test('duplicate IDs abort the migration instead of renumbering existing history', () => {
  assert.throws(() => planMaterialImport([part(1,'1','روغن دوزمانه',1), part(1,'2','دستمزد نصب تابلو',2)]), /شناسه/);
});

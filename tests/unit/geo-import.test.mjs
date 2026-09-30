import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/geoImport.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const {
  planGeoImport, entriesFromPlan, applicableRows, missingGeoCsv, missingGeoCount, parseCoordinateNumber, validateCoordinates, normalizeName,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

// synthetic contracts only
const contracts = [
  { id: 1, no: '101', building: '*برج الماس', address: 'خیابان آزمایشی ۱' },
  { id: 2, no: '102', building: 'مجتمع گل‌سرخ' },
  { id: 3, no: 'M-7', building: 'ساختمان ۱۲' },
  { id: 4, no: '104', building: 'برج دوقلو' },
  { id: 5, no: '105', building: 'برج دوقلو' },                            // same name as 4 → a name alone is ambiguous
  { id: 6, no: '106', building: 'ساختمان لغوشده', isCanceled: true },
  { id: 7, no: '107', building: 'یک ساختمان', buildingName: 'ساختمان کوروش' },
  { id: 8, no: '108', building: 'برج «ستاره»، بلوک الف' },
];
const existing = [{ contractId: 2, latitude: 36.2688, longitude: 50.0041 }];
const only = (plan, line) => plan.rows.find((row) => row.line === line);

test('header + comma, Persian digits and Persian decimal separator', () => {
  const plan = planGeoImport('شماره قرارداد,ساختمان,عرض جغرافیایی,طول جغرافیایی\n۱۰۱,برج الماس,۳۶٫۲۶۸۸۰۱,۵۰٫۰۰۴۱۲۴', contracts, existing);
  assert.equal(plan.headerDetected, true);
  assert.equal(plan.delimiter, ',');
  assert.equal(plan.rows.length, 1);
  assert.deepEqual([plan.rows[0].status, plan.rows[0].contractId, plan.rows[0].latitude, plan.rows[0].longitude], ['new', 1, 36.268801, 50.004124]);
  assert.equal(plan.rows[0].line, 2);
  assert.equal(plan.rows[0].building, 'برج الماس');
});

test('semicolon files with decimal commas (Persian Excel), tab files (pasted from a sheet) and header-less 3 columns', () => {
  const semicolon = planGeoImport('no;building;lat;lng\nM-7;"ساختمان ۱۲";"36,270001";"50,010002"', contracts, existing);
  assert.equal(semicolon.delimiter, ';');
  assert.deepEqual([semicolon.rows[0].status, semicolon.rows[0].latitude, semicolon.rows[0].longitude], ['new', 36.270001, 50.010002]);

  const tab = planGeoImport('101\t36.26880\t50.00410\n104\t36.27100\t50.01100', contracts, existing);
  assert.equal(tab.delimiter, '\t');
  assert.equal(tab.headerDetected, false);
  assert.deepEqual(tab.rows.map((row) => row.status), ['new', 'new']);

  const plain = planGeoImport('101,36.26880,50.00410', contracts, existing);
  assert.deepEqual([plain.rows[0].status, plain.rows[0].contractId], ['new', 1]);
});

test('a file saved in the old Windows-1256 encoding (Arabic yeh/kaf in the headers and names) is understood', () => {
  const plan = planGeoImport('شماره قرارداد;ساختمان;عرض جغرافيايي;طول جغرافيايي\n101;برج الماس;36,268801;50,004124\n107;ساختمان كوروش;36,270001;50,010002', contracts, []);
  assert.equal(plan.headerDetected, true);
  assert.deepEqual(plan.rows.map((row) => [row.status, row.contractId]), [['new', 1], ['new', 7]]);
  const byArabicName = planGeoImport('ساختمان;عرض;طول\nيك ساختمان;36.268801;50.004124', contracts, []);
  assert.deepEqual([byArabicName.rows[0].status, byArabicName.rows[0].contractId], ['new', 7]);
});

test('both numbers in one cell, like a copy from a map app', () => {
  const quoted = planGeoImport('101,"36.268801, 50.004124"', contracts, existing);
  assert.deepEqual([quoted.rows[0].status, quoted.rows[0].latitude, quoted.rows[0].longitude], ['new', 36.268801, 50.004124]);
  const withHeader = planGeoImport('شماره قرارداد,مختصات\n104,"۳۶٫۲۷۱۰۰۰، ۵۰٫۰۱۱۰۰۰"', contracts, existing);
  assert.deepEqual([withHeader.rows[0].status, withHeader.rows[0].latitude], ['new', 36.271]);
});

test('matching: contract number first, then the exact building name (digits, ی/ک, «*» and punctuation are ignored)', () => {
  const plan = planGeoImport([
    'ساختمان,عرض,طول',
    'برج الماس,36.268801,50.004124',          // 2: name; the stored name starts with «*»
    'ساختمان 12,36.270001,50.010002',        // 3: Latin digits vs the Persian digits stored
    'ساختمان كوروش,36.271001,50.011002',     // 4: Arabic kaf, matched through buildingName
    'برج ستاره بلوک الف,36.272001,50.012002', // 5: punctuation differs
    'برج دوقلو,36.273001,50.013002',          // 6: two buildings share this name
    'ساختمان ناشناس,36.274001,50.014002',     // 7: nothing like it
  ].join('\n'), contracts, []);
  assert.deepEqual(plan.rows.map((row) => [row.line, row.status, row.contractId]), [
    [2, 'new', 1], [3, 'new', 3], [4, 'new', 7], [5, 'new', 8], [6, 'ambiguous', undefined], [7, 'noMatch', undefined],
  ]);
  assert.match(only(plan, 6).reason, /چند قرارداد/);
});

test('a contract number wins over a conflicting name; an ambiguous name is fixed by giving the number', () => {
  const plan = planGeoImport('شماره قرارداد,ساختمان,عرض,طول\n104,برج الماس,36.268801,50.004124\n105,برج دوقلو,36.273001,50.013002', contracts, []);
  assert.deepEqual(plan.rows.map((row) => [row.status, row.contractId]), [['new', 4], ['new', 5]]);
});

test('invalid coordinates are explained and never accepted: swapped, outside Iran, too coarse, not numbers, degrees/minutes, out of range', () => {
  const plan = planGeoImport([
    'شماره قرارداد,عرض,طول',
    '101,50.004124,36.268801',              // 2 swapped
    '102,51.507400,-0.127800',              // 3 London
    '104,36.27,50.0',                        // 4 too coarse (a rounded spreadsheet cell)
    '105,abc,50.004124',                     // 5 not a number
    `107,36°16'07"N,50°00'14"E`,             // 6 degrees/minutes/seconds
    '108,95.000000,50.004124',               // 7 latitude out of range
    '3,36.268801,50.004124',                 // 8 no such contract number → noMatch (not invalid)
  ].join('\n'), contracts, []);
  const status = plan.rows.map((row) => row.status);
  assert.deepEqual(status, ['invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'noMatch']);
  assert.match(only(plan, 2).reason, /جابه‌جا/);
  assert.match(only(plan, 3).reason, /خارج از محدودهٔ ایران/);
  assert.match(only(plan, 4).reason, /کم‌دقت/);
  assert.match(only(plan, 5).reason, /عدد معتبر/);
  assert.match(only(plan, 6).reason, /درجه/);
  assert.match(only(plan, 7).reason, /بین منفی/);
  assert.equal(applicableRows(plan).length, 0);
  assert.deepEqual(entriesFromPlan(plan, 1), []);
});

test('the template round trip: empty coordinates are ignored, filled ones match by number even when names contain commas and quotes', () => {
  const csv = missingGeoCsv(contracts, existing);
  assert.ok(csv.startsWith('\uFEFF'), 'Excel needs the BOM for Persian text');
  const lines = csv.slice(1).split('\n');
  assert.equal(lines[0], '"شماره قرارداد","ساختمان","آدرس","عرض جغرافیایی","طول جغرافیایی"');
  assert.equal(lines.length - 1, 6, 'eight contracts − one with GPS − one cancelled');
  assert.ok(!csv.includes('ساختمان لغوشده') && !csv.includes('گل‌سرخ'));
  assert.ok(!csv.includes('*'), 'the leading * of a stored name is not exported');
  assert.equal(missingGeoCount(contracts, existing), 6);

  // the office fills two rows (the last two cells of a row are the empty latitude and longitude)
  const fill = (line, lat, lng) => line.replace(/"",""$/, `"${lat}","${lng}"`);
  const filled = lines.map((line, index) => {
    if (line.startsWith('"101"')) return fill(line, '36.268801', '50.004124');
    if (line.startsWith('"108"')) return fill(line, '36.272001', '50.012002');   // its name contains a comma and quotes
    return line;
  }).join('\n');
  const plan = planGeoImport(filled, contracts, existing);
  assert.equal(plan.headerDetected, true);
  assert.equal(plan.counts.new, 2, JSON.stringify(plan.counts));
  assert.equal(plan.counts.empty, 4);
  assert.equal(plan.counts.noMatch + plan.counts.invalid + plan.counts.ambiguous, 0);
  assert.deepEqual(applicableRows(plan).map((row) => row.contractId).sort(), [1, 8]);
});

test('existing locations: same place stays, different place is kept unless «replace» is chosen', () => {
  const text = 'شماره قرارداد,عرض,طول\n102,36.268800,50.004100\n102,36.280000,50.020000';
  const keep = planGeoImport(text, contracts, existing);
  assert.deepEqual(keep.rows.map((row) => row.status), ['same', 'duplicate']);

  const different = 'شماره قرارداد,عرض,طول\n102,36.280000,50.020000';
  const kept = planGeoImport(different, contracts, existing);
  assert.equal(kept.rows[0].status, 'keep');
  assert.equal(applicableRows(kept).length, 0);
  const replaced = planGeoImport(different, contracts, existing, { overwrite: true });
  assert.equal(replaced.rows[0].status, 'replace');
  assert.deepEqual(replaced.rows[0].previous, { latitude: 36.2688, longitude: 50.0041 });
  assert.deepEqual(entriesFromPlan(replaced, 99), [{ contractId: 2, latitude: 36.28, longitude: 50.02, updatedAt: 99 }]);
});

test('duplicates inside the file: the first valid row wins and the later one says which line it lost to', () => {
  const plan = planGeoImport('شماره قرارداد,عرض,طول\n101,36.268801,50.004124\n101,36.999999,50.999999\nبرج الماس,36.111111,50.111111', contracts, []);
  assert.deepEqual(plan.rows.map((row) => row.status), ['new', 'duplicate', 'noMatch']);   // the last one is a number column holding a name → no number match
  assert.match(only(plan, 3).reason, /سطر ۲/);
  assert.equal(entriesFromPlan(plan, 5).length, 1);
  assert.equal(entriesFromPlan(plan, 5)[0].latitude, 36.268801);
});

test('structure problems are reported instead of guessing: empty text, header without coordinate columns, header only', () => {
  assert.match(planGeoImport('   \n', contracts, []).problem, /متنی/);
  assert.match(planGeoImport('شماره قرارداد,ساختمان\n101,برج الماس', contracts, []).problem, /عرض و طول/);
  assert.match(planGeoImport('عرض,طول\n36.268801,50.004124', contracts, []).problem, /شماره قرارداد/);
  assert.match(planGeoImport('شماره قرارداد,عرض,طول', contracts, []).problem, /هیچ سطر داده/);
  assert.match(planGeoImport('فقط یک ستون', contracts, []).problem, /ستون‌ها/);
});

test('BOM, CRLF, blank lines, quoted names with commas, quotes and line breaks keep correct line numbers', () => {
  const text = '\uFEFF"شماره قرارداد","ساختمان","عرض","طول"\r\n\r\n"101","برج ""الماس"",\r\nبلوک ب","36.268801","50.004124"\r\n"104","برج دوقلو","36.270001","50.010002"\r\n';
  const plan = planGeoImport(text, contracts, []);
  assert.deepEqual(plan.rows.map((row) => [row.line, row.status, row.contractId]), [[3, 'new', 1], [5, 'new', 4]]);
});

test('number parsing accepts what people really type and rejects the rest', () => {
  assert.deepEqual(parseCoordinateNumber('36.268801'), { value: 36.268801, decimals: 6 });
  assert.deepEqual(parseCoordinateNumber(' +36,2688 '), { value: 36.2688, decimals: 4 });
  assert.deepEqual(parseCoordinateNumber('۳۶٫۲۶۸۸'), { value: 36.2688, decimals: 4 });
  assert.deepEqual(parseCoordinateNumber('٣٦.٢٦٨٨'), { value: 36.2688, decimals: 4 });
  assert.deepEqual(parseCoordinateNumber('\u221236.2688'), { value: -36.2688, decimals: 4 });
  assert.deepEqual(parseCoordinateNumber('36.2688°'), { value: 36.2688, decimals: 4 });
  for (const bad of ['', 'abc', '36.2.688', '36,268,8', '1e3', '36.2688N', '--3']) assert.equal(parseCoordinateNumber(bad), null, bad);
  assert.equal(validateCoordinates({ value: 36.2688, decimals: 4 }, { value: 50.0041, decimals: 4 }).ok, true);
  assert.equal(validateCoordinates({ value: 36.2688, decimals: 4 }, { value: 50.0041, decimals: 3 }).ok, false);
});

test('names are compared loosely but exactly: Arabic letters, half-spaces, stars and punctuation do not matter; a different word does', () => {
  assert.equal(normalizeName('*برج الماس'), normalizeName('برج  الماس'));
  assert.equal(normalizeName('كوروش'), normalizeName('کوروش'));
  assert.equal(normalizeName('يك ساختمان'), normalizeName('یک ساختمان'));        // Arabic yeh + kaf
  assert.equal(normalizeName('گل‌سرخ'), normalizeName('گل سرخ'));
  assert.equal(normalizeName('ساختمان ۱۲'), normalizeName('ساختمان 12'));
  assert.notEqual(normalizeName('برج الماس'), normalizeName('برج الماس ۲'));
});

test('a file of 5,000 rows against 5,000 contracts is planned in well under a second', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, no: String(9000 + i), building: `ساختمان آزمایشی ${i}` }));
  const rows = many.map((c, i) => `${c.no},${(36 + (i % 100) / 1000).toFixed(6)},${(50 + (i % 70) / 1000).toFixed(6)}`);
  const started = performance.now();
  const plan = planGeoImport(['شماره قرارداد,عرض,طول', ...rows].join('\n'), many, []);
  const elapsed = performance.now() - started;
  assert.equal(plan.counts.new, 5000);
  assert.ok(elapsed < 800, `took ${elapsed.toFixed(0)} ms`);
});

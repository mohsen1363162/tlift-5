import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/nearbyMap.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const {
  haversineMeters, selectMapBuildings, countWithin, viewAround, viewFitting, projectToView, ringDiameterPercent, tilesForView, formatDistanceFa,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const HOME = { lat: 36.27, lng: 50.0 };
// metres → degrees around HOME (good enough for test fixtures)
const north = (m) => HOME.lat + m / 111194.93;
const east = (m) => HOME.lng + m / (111194.93 * Math.cos((HOME.lat * Math.PI) / 180));
const row = (id, name, at, pending = false) => ({ id, name, lat: at ? at.lat : null, lng: at ? at.lng : null, pending, search: `${name} no-${id} manager address`.toLowerCase() });

const rows = [
  row(1, 'برج الف', { lat: north(300), lng: HOME.lng }),
  row(2, 'برج ب', { lat: HOME.lat, lng: east(1200) }, true),
  row(3, 'برج پ', { lat: north(2400), lng: HOME.lng }),
  row(4, 'برج ت', { lat: north(6000), lng: HOME.lng }, true),   // far
  row(5, 'برج ث', null, true),                                    // no GPS
  row(6, 'برج ج', null),                                          // no GPS
  row(7, 'برج چ', { lat: north(150), lng: east(150) }),
];

test('distance: one degree of latitude is about 111 km, and small offsets come out in metres', () => {
  assert.ok(Math.abs(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111195) < 50);
  assert.ok(Math.abs(haversineMeters(HOME, { lat: north(300), lng: HOME.lng }) - 300) < 1);
  assert.equal(haversineMeters(HOME, HOME), 0);
});

test('nearby: only real GPS inside the radius, nearest first, limit caps the list but not the total', () => {
  const all = selectMapBuildings(rows, { mode: 'nearby', origin: HOME, radiusM: 2500, limit: 10 });
  assert.deepEqual(all.picks.map((p) => p.id), [7, 1, 2, 3]);                 // 212 m, 300 m, 1200 m, 2400 m
  assert.equal(all.total, 4);
  assert.ok(all.picks.every((p) => p.registered && p.distanceM !== null));
  assert.ok(all.picks.every((p, i, list) => i === 0 || list[i - 1].distanceM <= p.distanceM));

  const capped = selectMapBuildings(rows, { mode: 'nearby', origin: HOME, radiusM: 2500, limit: 2 });
  assert.deepEqual(capped.picks.map((p) => p.id), [7, 1]);
  assert.equal(capped.total, 4, 'the total still counts everything inside the radius');

  const small = selectMapBuildings(rows, { mode: 'nearby', origin: HOME, radiusM: 500, limit: 10 });
  assert.deepEqual(small.picks.map((p) => p.id), [7, 1]);
  const wide = selectMapBuildings(rows, { mode: 'nearby', origin: HOME, radiusM: 10000, limit: 10 });
  assert.deepEqual(wide.picks.map((p) => p.id), [7, 1, 2, 3, 4]);
});

test('nearby never invents a position: without a known location nothing is shown, and buildings without GPS are never "near"', () => {
  assert.deepEqual(selectMapBuildings(rows, { mode: 'nearby', origin: null, radiusM: 2500, limit: 10 }).picks, []);
  const near = selectMapBuildings(rows, { mode: 'nearby', origin: HOME, radiusM: 10000, limit: 50 });
  assert.ok(!near.picks.some((p) => p.id === 5 || p.id === 6));
});

test('a search looks at every building (also far ones and ones without GPS); the chip filter is ignored while searching', () => {
  const found = selectMapBuildings(rows, { mode: 'nearby', query: '  برج ث ', origin: HOME, radiusM: 500, limit: 10 });
  assert.deepEqual(found.picks, [{ id: 5, registered: false, distanceM: null }]);
  assert.equal(found.searched, true);
  const far = selectMapBuildings(rows, { mode: 'nearby', query: 'برج ت', origin: HOME, radiusM: 500, limit: 10 });
  assert.deepEqual(far.picks.map((p) => p.id), [4]);
  assert.equal(selectMapBuildings(rows, { mode: 'all', query: 'چیزی-که-نیست', origin: HOME, radiusM: 500, limit: 10 }).total, 0);
  assert.deepEqual(selectMapBuildings(rows, { mode: 'all', query: 'NO-2', origin: null, radiusM: 500, limit: 10 }).picks.map((p) => p.id), [2], 'case-insensitive on the number');
});

test('the other filters still work and are bounded: registered, pending, all; located buildings first, the rest by name', () => {
  const registered = selectMapBuildings(rows, { mode: 'registered', origin: HOME, radiusM: 2500, limit: 3 });
  assert.equal(registered.total, 5);
  assert.deepEqual(registered.picks.map((p) => p.id), [7, 1, 2]);

  const pending = selectMapBuildings(rows, { mode: 'pending', origin: HOME, radiusM: 2500, limit: 10 });
  assert.deepEqual(pending.picks.map((p) => p.id), [2, 4, 5]);               // located first (nearest first), then the one without GPS
  assert.deepEqual(pending.picks.map((p) => p.registered), [true, true, false]);

  const everything = selectMapBuildings(rows, { mode: 'all', origin: HOME, radiusM: 2500, limit: 100 });
  assert.equal(everything.total, rows.length);
  assert.deepEqual(everything.picks.slice(-2).map((p) => p.id), [5, 6], 'buildings without GPS come last');

  const noPosition = selectMapBuildings(rows, { mode: 'all', origin: null, radiusM: 2500, limit: 100 });
  assert.equal(noPosition.total, rows.length);
  assert.ok(noPosition.picks.every((p) => p.distanceM === null));
  assert.deepEqual(noPosition.picks.slice(-2).map((p) => p.id), [5, 6]);
  assert.equal(selectMapBuildings(rows, { mode: 'all', origin: HOME, radiusM: 1, limit: 0 }).picks.length, 0);
});

test('countWithin gives the counters of the chip and of the «ورود به محدوده» bar', () => {
  assert.deepEqual(countWithin(rows, HOME, 2500), { total: 4, pending: 1 });
  assert.deepEqual(countWithin(rows, HOME, 100), { total: 0, pending: 0 });
  assert.deepEqual(countWithin(rows, HOME, 10000), { total: 5, pending: 2 });
});

test('projection: the centre is in the middle, and a point half a window away lands on the edge', () => {
  const view = viewAround(HOME, 2800);
  const centre = projectToView(view, HOME.lat, HOME.lng);
  assert.ok(Math.abs(centre.x - 50) < 1e-9 && Math.abs(centre.y - 50) < 1e-9);
  const eastEdge = projectToView(view, HOME.lat, east(2800));
  assert.ok(Math.abs(eastEdge.x - 100) < 0.6 && Math.abs(eastEdge.y - 50) < 0.6, JSON.stringify(eastEdge));
  const northEdge = projectToView(view, north(2800), HOME.lng);
  assert.ok(Math.abs(northEdge.x - 50) < 0.6 && Math.abs(northEdge.y - 0) < 0.6, JSON.stringify(northEdge));
  assert.ok(Math.abs(ringDiameterPercent(view, 2800) - 100) < 1e-9);
  assert.ok(Math.abs(ringDiameterPercent(view, 1400) - 50) < 1e-9);
  // 1 km to the east/north of the centre is the same number of percent (the window is square and isotropic)
  const e1 = projectToView(view, HOME.lat, east(1000));
  const n1 = projectToView(view, north(1000), HOME.lng);
  assert.ok(Math.abs((e1.x - 50) - (50 - n1.y)) < 0.3, `${e1.x - 50} vs ${50 - n1.y}`);
});

test('fitting a window to the shown pins keeps all of them inside, never smaller than the minimum, and has a fallback', () => {
  const points = rows.filter((r) => r.lat !== null).map((r) => ({ lat: r.lat, lng: r.lng }));
  const view = viewFitting(points, { fallback: HOME, minHalfSpanM: 300 });
  for (const point of points) {
    const at = projectToView(view, point.lat, point.lng);
    assert.ok(at.x >= 0 && at.x <= 100 && at.y >= 0 && at.y <= 100, JSON.stringify(at));
  }
  const single = viewFitting([HOME], { fallback: HOME, minHalfSpanM: 300 });
  assert.equal(single.halfSpanM, 300);
  const none = viewFitting([], { fallback: HOME });
  assert.deepEqual([none.centerLat, none.centerLng], [HOME.lat, HOME.lng]);
  assert.ok(none.halfSpanM >= 1500);
});

// the reference formulas from the OpenStreetMap wiki ("Slippy map tilenames")
const tileOf = (lat, lng, z) => ({
  x: Math.floor(((lng + 180) / 360) * 2 ** z),
  y: Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z),
});
const cornerOf = (x, y, z) => ({
  lng: (x / 2 ** z) * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI,
});

test('OSM tiles: few, on the standard grid, cover the whole window, and line up exactly with the pins', () => {
  for (const [halfSpan, canvas, ratio] of [[2800, 390, 1], [2800, 390, 3], [600, 390, 2], [12000, 360, 2]]) {
    const view = viewAround(HOME, halfSpan);
    const tiles = tilesForView(view, canvas, ratio);
    assert.ok(tiles.length >= 1 && tiles.length <= 16, `${tiles.length} tiles for ${halfSpan} m`);
    assert.ok(tiles.every((t) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(t.src)));
    assert.ok(Math.min(...tiles.map((t) => t.left)) <= 0 && Math.max(...tiles.map((t) => t.left + t.size)) >= 100, 'covers left-right');
    assert.ok(Math.min(...tiles.map((t) => t.top)) <= 0 && Math.max(...tiles.map((t) => t.top + t.size)) >= 100, 'covers top-bottom');

    const z = Number(tiles[0].src.split('/')[3]);
    const expected = tileOf(HOME.lat, HOME.lng, z);
    const centreTile = tiles.find((t) => t.src.endsWith(`/${z}/${expected.x}/${expected.y}.png`));
    assert.ok(centreTile, 'the tile that holds the centre point is requested');
    assert.ok(centreTile.left <= 50 && 50 <= centreTile.left + centreTile.size && centreTile.top <= 50 && 50 <= centreTile.top + centreTile.size);

    // the top-left corner of that tile, projected like a pin, sits exactly where the tile image is drawn
    const corner = cornerOf(expected.x, expected.y, z);
    const at = projectToView(view, corner.lat, corner.lng);
    assert.ok(Math.abs(at.x - centreTile.left) < 0.01 && Math.abs(at.y - centreTile.top) < 0.01, `${JSON.stringify(at)} vs ${centreTile.left},${centreTile.top}`);
  }
});

test('distance labels are Persian and switch from metres to kilometres', () => {
  assert.equal(formatDistanceFa(279), '۲۷۹ متر');
  assert.match(formatDistanceFa(1400), /^۱٫۴ کیلومتر$/);
  assert.match(formatDistanceFa(999.4), /متر$/);
});

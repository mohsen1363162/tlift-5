import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/bestPosition.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const { acquireBestPosition, REGISTER_GOOD_ENOUGH_M, REGISTER_MAX_ACCURACY_M, REGISTER_WINDOW_MS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const fix = (accuracy, latitude = 36.268801, longitude = 50.004124) => ({ coords: { latitude, longitude, accuracy } });

/** a scripted geolocation: `script` is a list of [delayMs, fix | {error}] that start when watchPosition is called */
function fakeGeolocation(script, { synchronous = false } = {}) {
  const geo = { watches: 0, cleared: [], options: null, timers: [] };
  geo.watchPosition = (success, error, options) => {
    geo.options = options;
    const id = ++geo.watches;
    for (const [delay, item] of script) {
      const run = () => { if (!geo.cleared.includes(id)) (item.error ? error : success)(item.error ? item.error : item); };
      if (synchronous && delay === 0) run(); else geo.timers.push(setTimeout(run, delay));
    }
    return id;
  };
  geo.clearWatch = (id) => { geo.cleared.push(id); };
  geo.stop = () => geo.timers.forEach(clearTimeout);
  return geo;
}

test('thresholds: good enough is tighter than the acceptance limit, and the default window is a few seconds', () => {
  assert.ok(REGISTER_GOOD_ENOUGH_M < REGISTER_MAX_ACCURACY_M);
  assert.ok(REGISTER_WINDOW_MS >= 5000 && REGISTER_WINDOW_MS <= 20000);
});

test('a good first fix ends at once and the watch is cleared; it asks for fresh high-accuracy data', async () => {
  const geo = fakeGeolocation([[0, fix(12)]]);
  const started = Date.now();
  const position = await acquireBestPosition({ geolocation: geo, windowMs: 2000 });
  assert.equal(position.coords.accuracy, 12);
  assert.ok(Date.now() - started < 500, 'did not wait for the window');
  assert.deepEqual(geo.cleared, [1]);
  assert.equal(geo.options.enableHighAccuracy, true);
  assert.equal(geo.options.maximumAge, 0, 'a cached position is never used to register a building');
  geo.stop();
});

test('an approximate first fix is improved: it keeps listening and takes the accurate one when it arrives', async () => {
  const geo = fakeGeolocation([[0, fix(450)], [20, fix(130)], [40, fix(18, 36.27, 50.01)], [60, fix(5, 1, 1)]]);
  const position = await acquireBestPosition({ geolocation: geo, windowMs: 2000 });
  assert.equal(position.coords.accuracy, 18);
  assert.equal(position.coords.latitude, 36.27);
  assert.deepEqual(geo.cleared, [1]);
  geo.stop();
});

test('when the window ends without a good fix the BEST one is returned (the caller decides), not an error and not the last one', async () => {
  const geo = fakeGeolocation([[0, fix(300)], [10, fix(60)], [20, fix(90)]]);
  const position = await acquireBestPosition({ geolocation: geo, windowMs: 100 });
  assert.equal(position.coords.accuracy, 60);
  assert.deepEqual(geo.cleared, [1]);
  geo.stop();
});

test('no fix at all until the window ends → timeout error (code 3)', async () => {
  const geo = fakeGeolocation([]);
  await assert.rejects(acquireBestPosition({ geolocation: geo, windowMs: 40 }), (error) => error.code === 3);
  assert.deepEqual(geo.cleared, [1]);
});

test('permission denied ends immediately with code 1; other errors do not end a window that still has a chance', async () => {
  const denied = fakeGeolocation([[0, { error: { code: 1 } }]]);
  const started = Date.now();
  await assert.rejects(acquireBestPosition({ geolocation: denied, windowMs: 2000 }), (error) => error.code === 1);
  assert.ok(Date.now() - started < 500);
  assert.deepEqual(denied.cleared, [1]);
  denied.stop();

  const flaky = fakeGeolocation([[0, { error: { code: 2 } }], [20, fix(40)]]);
  const position = await acquireBestPosition({ geolocation: flaky, windowMs: 100 });
  assert.equal(position.coords.accuracy, 40);
  flaky.stop();

  const onlyUnavailable = fakeGeolocation([[0, { error: { code: 2 } }]]);
  await assert.rejects(acquireBestPosition({ geolocation: onlyUnavailable, windowMs: 40 }), (error) => error.code === 2);
  onlyUnavailable.stop();
});

test('unsupported devices fail with code 0 without touching anything', async () => {
  await assert.rejects(acquireBestPosition({ geolocation: null }), (error) => error.code === 0);
});

test('broken fixes (NaN) are ignored and never win over a real one', async () => {
  const geo = fakeGeolocation([[0, fix(NaN)], [0, { coords: { latitude: NaN, longitude: 50, accuracy: 3 } }], [15, fix(70)]]);
  const position = await acquireBestPosition({ geolocation: geo, windowMs: 80 });
  assert.equal(position.coords.accuracy, 70);
  geo.stop();
});

test('a browser that answers synchronously inside watchPosition still gets its watch cleared exactly once', async () => {
  const geo = fakeGeolocation([[0, fix(10)]], { synchronous: true });
  const position = await acquireBestPosition({ geolocation: geo, windowMs: 1000 });
  assert.equal(position.coords.accuracy, 10);
  assert.deepEqual(geo.cleared, [1]);
  geo.stop();
});

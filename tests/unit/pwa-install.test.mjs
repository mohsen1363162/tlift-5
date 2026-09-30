import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';

const compiled = buildSync({ entryPoints: ['src/utils/pwaInstall.ts'], bundle: true, format: 'esm', platform: 'node', write: false }).outputFiles[0].text;
const load = () => import(`data:text/javascript;base64,${Buffer.from(`${compiled}\n// ${Math.random()}`).toString('base64')}`);

// a minimal window: an EventTarget is all the capture code needs
const fakePrompt = (outcome = 'accepted') => {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  event.calls = 0;
  event.prompt = async () => { event.calls++; };
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
};

test('the install offer that arrives BEFORE any component exists is kept and handed out later', async () => {
  const { startInstallCapture, getInstallState } = await load();
  const win = new EventTarget();
  startInstallCapture(win);
  const early = fakePrompt();
  win.dispatchEvent(early);                                   // fires long before React mounts the install dialog
  assert.equal(early.defaultPrevented, true, 'the browser mini-bar is suppressed: the app offers its own «نصب» button');
  assert.equal(getInstallState().promptEvent, early);
});

test('subscribers are told about a late offer, and the snapshot changes only when something changed', async () => {
  const { startInstallCapture, getInstallState, subscribeInstallState } = await load();
  const win = new EventTarget();
  startInstallCapture(win);
  let calls = 0;
  const unsubscribe = subscribeInstallState(() => { calls++; });
  const before = getInstallState();
  assert.equal(getInstallState(), before, 'stable snapshot without changes (useSyncExternalStore requirement)');
  win.dispatchEvent(fakePrompt());
  assert.equal(calls, 1);
  assert.notEqual(getInstallState(), before);
  unsubscribe();
  win.dispatchEvent(fakePrompt());
  assert.equal(calls, 1, 'an unsubscribed listener is not called');
});

test('starting twice does not register twice', async () => {
  const { startInstallCapture, subscribeInstallState } = await load();
  const win = new EventTarget();
  startInstallCapture(win);
  startInstallCapture(win);
  let calls = 0;
  subscribeInstallState(() => { calls++; });
  win.dispatchEvent(fakePrompt());
  assert.equal(calls, 1);
});

test('promptInstall shows the browser sheet once, reports the choice, and clears the used offer', async () => {
  const { startInstallCapture, promptInstall, getInstallState } = await load();
  const win = new EventTarget();
  startInstallCapture(win);
  assert.equal(await promptInstall(), 'unavailable', 'nothing to show before Chrome made an offer');
  const accepted = fakePrompt('accepted');
  win.dispatchEvent(accepted);
  assert.equal(await promptInstall(), 'accepted');
  assert.equal(accepted.calls, 1);
  assert.equal(getInstallState().promptEvent, null);
  assert.equal(getInstallState().installed, true);

  const dismissedWin = new EventTarget();
  const fresh = await load();
  fresh.startInstallCapture(dismissedWin);
  dismissedWin.dispatchEvent(fakePrompt('dismissed'));
  assert.equal(await fresh.promptInstall(), 'dismissed');
  assert.equal(fresh.getInstallState().installed, false);
  assert.equal(fresh.getInstallState().promptEvent, null);
});

test('appinstalled marks the app as installed and drops the offer', async () => {
  const { startInstallCapture, getInstallState } = await load();
  const win = new EventTarget();
  startInstallCapture(win);
  win.dispatchEvent(fakePrompt());
  win.dispatchEvent(new Event('appinstalled'));
  assert.deepEqual({ ...getInstallState() }, { promptEvent: null, installed: true });
});

test('the install files: a clean start address, one identity, real icons, and a server config that does not break the manifest or the service worker', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  assert.equal(manifest.start_url, '/', 'no «?mode=mobile» suffix');
  assert.equal(manifest.id, '/asemansara-app-v3', 'the install identity must not change');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'T_lift');
  const icons = manifest.icons.map((icon) => `${icon.sizes}/${icon.purpose}`).sort();
  assert.deepEqual(icons, ['192x192/any', '192x192/maskable', '512x512/any', '512x512/maskable']);
  const vite = readFileSync('vite.config.ts', 'utf8');
  assert.match(vite, /start_url:\s*"\/"/, 'the generated manifest uses the same start address');
  assert.doesNotMatch(vite + JSON.stringify(manifest), /mode=mobile/);

  const htaccess = readFileSync('public/.htaccess', 'utf8');
  assert.match(htaccess, /RewriteCond %\{REQUEST_FILENAME\} -f/, 'existing files (manifest, sw.js, icons) are served as they are, not rewritten to index.html');
  assert.match(htaccess, /sw\\\.js\|registerSW\\\.js\|manifest\\\.webmanifest\|manifest\\\.json/, 'service worker and manifest are never cached stale');
  assert.match(htaccess, /AddType application\/manifest\+json \.webmanifest/);
  assert.match(readFileSync('index.html', 'utf8'), /<link rel="manifest" href="\/manifest\.json"/);
});

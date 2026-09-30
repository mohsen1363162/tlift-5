import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.use({ baseURL: process.env.INTEGRATION_BASE_URL || 'http://127.0.0.1:4174' });
const entry = '/tests/harness/index.html';
const report = 'گزارش آزمایشی: بازدید و تنظیم درب';
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=';

async function sandbox(page: Page, baseURL: string) {
  const server = { fail: false, writes: [] as any[], rows: new Map<string, any>(), errors: [] as string[], invalidAck: false, failKey: '', conflict: undefined as any, holdKey: '', gate: undefined as Promise<void> | undefined };
  page.on('pageerror', error => server.errors.push(error.message));
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    // Intercept ALL origins before considering a fake API. Never forward live requests.
    if (url.pathname.endsWith('/sync.php')) {
      if (url.searchParams.get('action') === 'register_device') return route.fulfill({ json: { token: 'synthetic-device-token-only' } });
      if (url.searchParams.has('action')) return route.fulfill({ json: { ok: true } });
      if (request.method() === 'POST') {
        const row = request.postDataJSON();
        server.writes.push(row);
        if (row.key === server.holdKey && server.gate) await server.gate;
        if (server.fail || row.key === server.failKey) return route.fulfill({ status: 503, json: { error: 'synthetic outage' } });
        if (server.invalidAck) return route.fulfill({ status: 200, body: '<html>not saved</html>', contentType: 'text/html' });
        if (server.conflict && row.key === server.conflict.key) {
          const conflict = server.conflict;
          server.conflict = undefined;
          return route.fulfill({ status: 409, json: { server: conflict } });
        }
        server.rows.set(row.key, row);
        return route.fulfill({ json: { ok: true, key: row.key } });
      }
      return route.fulfill({ json: [...server.rows.values()] });
    }
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });
  await page.addInitScript(() => {
    (window as any).__TLIFT_TEST_ISOLATED__ = true;
    if (sessionStorage.getItem('integration_seeded')) return;
    sessionStorage.setItem('integration_seeded', '1');
    const data: Record<string, unknown> = {
      tlift_manual_offline_v1: true, tlift_csv_seeded_v1: true, tlift_cust_csv_seeded_v1: true,
      tlift_sync_interval_minutes_v1: 0,
      tlift_parts: [{ id: 990001, code: 'TEST-PART', name: 'قطعه آزمایشی', unit: 'عدد', price: 10000 }],
      tlift_contracts: [{ id: 990001, no: 'TEST-001', building: 'ساختمان آزمایشی', manager: 'مدیر آزمایشی', zone: 'آزمایشی', start: '1405/01/01', end: '1405/12/29', kind: 'general', monthlyServiceFee: 1000000 }],
      tlift_contract_details: { 990001: { months: [{ id: 1, m: 'فروردین', y: 1405, amount: 1000000, done: false, paid: false }], payments: [], breakdowns: [], invoices: [] } },
      tlift_customer_session: { id: 'integration-admin', name: 'کاربر آزمایشی', role: 'admin', phone: '09000000000' },
    };
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(entry);
  await expect.poll(() => page.evaluate(() => !!(window as any).testApi)).toBe(true);
  await page.getByRole('button', { name: 'نمایش سایر امکانات', exact: true }).click();
  await expect(page.getByText('ثبت سرویس آفلاین', { exact: true })).toBeVisible();
  return server;
}
const queue = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tlift_offline_queue_v2') || '{}'));

// Uses real UI for creating and assigning the draft; real store/sync code sends it.
test('offline service UI: save, reload, assign, failed send and successful retry', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  await page.context().setOffline(true);
  // A service never starts before the workday: the technician presses «شروع کار» first (3.36.15).
  await page.getByRole('button', { name: 'شروع کار', exact: true }).click();
  await page.getByText('ثبت سرویس آفلاین', { exact: true }).click();
  await page.getByPlaceholder('نام مشتری یا ساختمان...').fill('ساختمان آزمایشی');
  await page.getByRole('button', { name: 'شروع ثبت آفلاین', exact: true }).click();
  await page.getByLabel('سالم', { exact: true }).first().check();
  await page.getByRole('button', { name: 'قطعات', exact: true }).click();
  await page.getByRole('button', { name: '+ انتخاب قطعه', exact: true }).click();
  await page.getByRole('button', { name: /قطعه آزمایشی/ }).click();
  await page.getByRole('button', { name: 'خرابی‌ها', exact: true }).click();
  await page.getByPlaceholder('شرح خرابی جدید...').fill('خرابی آزمایشی');
  await page.getByRole('button', { name: 'ثبت', exact: true }).click();
  await page.getByRole('button', { name: 'مرحله بعد', exact: true }).click();
  await page.getByLabel('اجرت (ریال)').fill('20000');
  await page.getByLabel('ایاب و ذهاب (ریال)').fill('30000');
  await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
  await expect(page.locator('img[src^="data:image/"]')).toHaveCount(1);
  await page.locator('textarea').nth(0).fill(report);
  await page.locator('textarea').nth(1).fill('یادآوری آزمایشی');
  await page.locator('textarea').nth(2).fill('پیگیری آزمایشی');
  await page.getByRole('button', { name: 'مرحله بعد', exact: true }).click();
  await page.getByLabel('عدم حضور مدیر', { exact: true }).check();
  await page.getByRole('button', { name: 'ثبت آفلاین و اتمام سرویس', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tlift_unassigned_offline_services_v1') || '[]').length)).toBe(1);
  // Bring the local test server back; manual offline mode still prevents sync.
  await page.context().setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: 'نمایش سایر امکانات', exact: true }).click();
  await page.getByText('صف سرویس‌های آفلاین', { exact: true }).click();
  await page.locator('select').selectOption('990001:1');
  await page.getByRole('button', { name: 'اتصال به سرویس و ثبت آنلاین', exact: true }).click();
  expect((await queue(page)).tlift_contract_details['990001'].months[0]).toMatchObject({ done: true, report, customerFollowup: 'پیگیری آزمایشی' });
  server.fail = true;
  await page.evaluate(() => (window as any).testApi.sync.setManualOffline(false));
  await expect.poll(() => server.writes.length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).testApi.sync.getSyncState().status)).not.toBe('syncing');
  expect((await queue(page)).tlift_contract_details['990001'].months[0].report).toBe(report);
  server.fail = false;
  await page.evaluate(() => (window as any).testApi.sync.syncNow());
  await expect.poll(() => queue(page)).toEqual({});
  expect(server.rows.get('tlift_contract_details').data['990001'].months[0]).toMatchObject({ done: true, report, customerFollowup: 'پیگیری آزمایشی' });
  const sentMonth = server.rows.get('tlift_contract_details').data['990001'].months[0];
  expect(sentMonth.partsList).toEqual([expect.objectContaining({ code: 'TEST-PART', qty: 1, price: 10000 })]);
  expect(sentMonth.wage).toBe(20000);
  expect(sentMonth.trip).toBe(30000);
  expect(sentMonth.faultsList).toEqual(['خرابی آزمایشی']);
  expect(Object.values(sentMonth.checklistResults)).toContain('ok');
  expect(sentMonth.attachments[0]).toMatch(/^data:image\//);
  const writes = server.writes.length;
  await page.evaluate(() => (window as any).testApi.sync.syncNow());
  expect(server.writes.length).toBe(writes);
  expect(server.errors).toEqual([]);
});

test('bootstrap marker must not discard an unsent report after reload', async ({ page, baseURL }) => {
  await sandbox(page, baseURL!);
  await page.evaluate(() => {
    localStorage.setItem('tlift_bootstrap_restored_v1', new Date().toISOString());
    (window as any).testApi.sync.pushKey('tlift_contract_details', { 990001: { months: [{ id: 1, done: true, report: 'pending report' }] } });
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!(window as any).testApi)).toBe(true);
  expect((await queue(page)).tlift_contract_details?.['990001'].months[0].report).toBe('pending report');
});

for (const device of [false, true]) {
  test(`${device ? 'IndexedDB daily' : 'JSON file'} backup restores raw strings and preserves pending queues`, async ({ page, baseURL }) => {
    const server = await sandbox(page, baseURL!);
    const result = await page.evaluate(async ({ device, photo }) => {
      const api = (window as any).testApi;
      localStorage.setItem('tlift_device_name_v1', 'نام دستگاه آزمایشی');
      localStorage.setItem('tlift_test_photos', JSON.stringify([photo]));
      api.sync.pushKey('tlift_test_pending', { report: 'backup pending' });
      api.appStore.updateMonthService(990001, 1, { done: true, report: 'backup report',
        attachments: [photo], checklistResults: { 1: 'ok' }, partsList: [{ name: 'قطعه آزمایشی', unit: 'عدد', qty: 1, price: 10000 }] });
      const backup = api.backup.createFullBackup();
      const snapshot = device ? await api.daily.createDeviceDailyBackup(true) : null;
      localStorage.setItem('tlift_device_name_v1', 'changed');
      localStorage.setItem('tlift_test_photos', '[]');
      api.sync.pushKey('tlift_test_new_pending', { report: 'new pending must survive' });
      if (device) await api.daily.restoreDeviceBackup(snapshot.date);
      else await api.backup.restoreFullBackup(new File([JSON.stringify(backup)], 'test.json'));
      return {
        details: JSON.parse(localStorage.getItem('tlift_contract_details') || '{}'),
        name: localStorage.getItem('tlift_device_name_v1'),
        photos: JSON.parse(localStorage.getItem('tlift_test_photos') || '[]'),
        queue: JSON.parse(localStorage.getItem('tlift_offline_queue_v2') || '{}'),
        dates: await api.daily.listDeviceBackupDates(),
      };
    }, { device, photo });
    expect(result.details['990001'].months[0]).toMatchObject({ done: true, report: 'backup report', attachments: [photo], checklistResults: { 1: 'ok' } });
    expect(result.name).toBe('نام دستگاه آزمایشی');
    expect(result.photos).toEqual([photo]);
    expect(result.queue.tlift_test_pending).toEqual({ report: 'backup pending' });
    expect(result.queue.tlift_test_new_pending).toEqual({ report: 'new pending must survive' });
    expect(result.queue).not.toHaveProperty('tlift_offline_queue_v2');
    expect(result.queue).not.toHaveProperty('tlift_customer_session');
    await page.evaluate(() => (window as any).testApi.sync.setManualOffline(false));
    await expect.poll(() => queue(page)).toEqual({});
    expect(server.writes.some(row => ['tlift_customer_session', 'tlift_offline_queue_v2', 'tlift_device_api_token_v1'].includes(row.key))).toBe(false);
    expect(server.rows.get('tlift_contract_details').data['990001'].months[0].report).toBe('backup report');
    expect(server.errors).toEqual([]);
  });
}

test('malformed backup is rejected before any writes', async ({ page, baseURL }) => {
  await sandbox(page, baseURL!);
  const result = await page.evaluate(async () => {
    const before = JSON.stringify({ ...localStorage });
    try {
      await (window as any).testApi.backup.restoreFullBackup(new File([JSON.stringify({ format: 'tlift-full-backup', version: 1, createdAt: new Date().toISOString(), entries: [] })], 'bad.json'));
      return { rejected: false, unchanged: before === JSON.stringify({ ...localStorage }) };
    } catch { return { rejected: true, unchanged: before === JSON.stringify({ ...localStorage }) }; }
  });
  expect(result).toEqual({ rejected: true, unchanged: true });
});

for (const fail of [false, true]) {
  test(`new edit survives an older in-flight ${fail ? 'failed' : 'successful'} send`, async ({ page, baseURL }) => {
    const server = await sandbox(page, baseURL!);
    let release!: () => void;
    server.holdKey = 'tlift_test_race';
    server.gate = new Promise<void>(resolve => { release = resolve; });
    server.fail = fail;
    await page.evaluate(() => {
      const sync = (window as any).testApi.sync;
      sync.pushKey('tlift_test_race', { report: 'old' });
      sync.setManualOffline(false);
      (window as any).testSend = sync.flushAll();
    });
    await expect.poll(() => server.writes.some(row => row.key === 'tlift_test_race')).toBe(true);
    await page.evaluate(() => {
      const sync = (window as any).testApi.sync;
      sync.setManualOffline(true);
      sync.pushKey('tlift_test_race', { report: 'new' });
    });
    release();
    await page.evaluate(() => (window as any).testSend);
    expect((await queue(page)).tlift_test_race).toEqual({ report: 'new' });
  });
}

test('legacy v1 backup restores data without copying device identity or deleting current pending edits', async ({ page, baseURL }) => {
  await sandbox(page, baseURL!);
  const restored = await page.evaluate(async () => {
    const api = (window as any).testApi;
    api.sync.pushKey('tlift_test_current', { report: 'new local report' });
    localStorage.setItem('tlift_device_id_v1', 'current-device');
    await api.backup.restoreFullBackup(new File([JSON.stringify({
      format: 'tlift-full-backup', version: 1, createdAt: '2026-09-28T00:00:00Z',
      entries: { tlift_device_id_v1: 'old-device', tlift_test_current: { report: 'old backup report' },
        tlift_device_name_v1: 'نام قدیمی', tlift_test_new: [{ id: 123, report: 'legacy report' }],
        tlift_offline_queue_v2: { tlift_test_legacy_pending: { report: 'legacy pending' } } },
    })], 'legacy.json'));
    return { id: localStorage.getItem('tlift_device_id_v1'), name: localStorage.getItem('tlift_device_name_v1'),
      current: JSON.parse(localStorage.getItem('tlift_test_current')!),
      pending: JSON.parse(localStorage.getItem('tlift_offline_queue_v2')!),
      manual: api.sync.getSyncState().isManualOffline };
  });
  expect(restored.id).toBe('current-device');
  expect(restored.name).toBe('نام قدیمی');
  expect(restored.current.report).toBe('new local report');
  expect(restored.pending.tlift_test_legacy_pending.report).toBe('legacy pending');
  expect(restored.manual).toBe(true);
});

test('storage quota failure rolls back restore and leaves original data/queue intact', async ({ page, baseURL }) => {
  await sandbox(page, baseURL!);
  const result = await page.evaluate(() => {
    const api = (window as any).testApi;
    const before = { ...localStorage };
    const setItem = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function (key, value) {
      if (++writes === 3) throw new DOMException('synthetic quota failure', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    let rejected = false;
    try {
      api.backup.restoreBackupData({ format: 'tlift-full-backup', version: 1, createdAt: new Date().toISOString(),
        entries: { tlift_contracts: [{ id: 99 }], tlift_test_new: 'should not remain' } });
    } catch { rejected = true; }
    finally { Storage.prototype.setItem = setItem; }
    return { rejected, before, after: { ...localStorage } };
  });
  expect(result.rejected).toBe(true);
  expect(result.after).toEqual(result.before);
});

test('aborted IndexedDB backup is not reported as a committed backup', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  const result = await page.evaluate(async () => {
    const api = (window as any).testApi;
    await api.daily.createDeviceDailyBackup(true);
    localStorage.setItem('tlift_last_device_backup_day_v1', 'unchanged-marker');
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: any[]) {
      const request = put.apply(this, args);
      this.transaction.abort();
      return request;
    };
    let rejected = false;
    try { await api.daily.createDeviceDailyBackup(true); } catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = put; }
    return { rejected, marker: localStorage.getItem('tlift_last_device_backup_day_v1') };
  });
  expect(result).toEqual({ rejected: true, marker: 'unchanged-marker' });
  expect(server.errors).toEqual([]);
});


test('a 200 HTML/error response is not a save acknowledgement', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  server.invalidAck = true;
  const result = await page.evaluate(async () => {
    const sync = (window as any).testApi.sync;
    sync.pushKey('tlift_test_no_ack', { report: 'must remain pending' });
    sync.setManualOffline(false);
    return sync.flushAll();
  });
  expect(result).toBe(false);
  expect((await queue(page)).tlift_test_no_ack.report).toBe('must remain pending');
});

test('automatic reconnect sends queued service data without another registration', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  await page.evaluate(async () => {
    const sync = (window as any).testApi.sync;
    sync.setManualOffline(false);
    await sync.syncNow();
  });
  await page.context().setOffline(true);
  await page.evaluate(() => (window as any).testApi.sync.pushKey('tlift_test_reconnect', { id: 123, report: 'reconnect report' }));
  expect((await queue(page)).tlift_test_reconnect.report).toBe('reconnect report');
  await page.context().setOffline(false);
  await expect.poll(() => queue(page)).toEqual({});
  expect(server.rows.get('tlift_test_reconnect').data.report).toBe('reconnect report');
});

test('partial send keeps the failed key and offline service log until retry succeeds', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  server.failKey = 'tlift_test_partial_failed';
  const result = await page.evaluate(async () => {
    const sync = (window as any).testApi.sync;
    sync.recordOfflineService({ id: 'partial', contractId: 990001, monthId: 1, doneDate: '1405/01/01', amount: 1, recordedAt: 1 });
    sync.pushKey('tlift_test_partial_ok', { report: 'ok report' });
    sync.pushKey('tlift_test_partial_failed', { report: 'retained report' });
    sync.setManualOffline(false);
    return sync.syncNow();
  });
  expect(result.success).toBe(false);
  expect((await queue(page)).tlift_test_partial_failed.report).toBe('retained report');
  expect(await page.evaluate(() => (window as any).testApi.sync.getOfflineServices())).toHaveLength(1);
  server.failKey = '';
  await page.evaluate(() => (window as any).testApi.sync.syncNow());
  expect(await queue(page)).toEqual({});
  expect(await page.evaluate(() => (window as any).testApi.sync.getOfflineServices())).toEqual([]);
});

test('409 retry merges reports from different contracts without losing either', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  server.conflict = { key: 'tlift_contract_details', updated_at: '2026-09-28T00:00:00Z',
    data: { 990002: { months: [{ id: 1, done: true, report: 'coworker report' }] } } };
  await page.evaluate(async () => {
    const sync = (window as any).testApi.sync;
    sync.pushKey('tlift_contract_details', { 990001: { months: [{ id: 1, done: true, report: 'local report' }] } });
    sync.setManualOffline(false);
    await sync.flushAll();
  });
  await expect.poll(() => queue(page)).toEqual({});
  const saved = server.rows.get('tlift_contract_details').data;
  expect(saved['990001'].months[0].report).toBe('local report');
  expect(saved['990002'].months[0].report).toBe('coworker report');
});

test('downloaded JSON backup is readable and can restore a deleted test-only value', async ({ page, baseURL }) => {
  await sandbox(page, baseURL!);
  await page.evaluate(() => localStorage.setItem('tlift_test_download', 'exact test value'));
  const downloadEvent = page.waitForEvent('download');
  await page.evaluate(() => (window as any).testApi.backup.downloadFullBackup());
  const download = await downloadEvent;
  const text = readFileSync((await download.path())!, 'utf8');
  const parsed = JSON.parse(text);
  expect(parsed.format).toBe('tlift-full-backup');
  expect(parsed.entries.tlift_test_download).toBe('exact test value');
  await page.evaluate(async text => {
    localStorage.removeItem('tlift_test_download'); // fresh synthetic context only
    await (window as any).testApi.backup.restoreFullBackup(new File([text], 'downloaded.json'));
  }, text);
  expect(await page.evaluate(() => localStorage.getItem('tlift_test_download'))).toBe('exact test value');
});

for (const entries of [{ tlift_contracts: 'broken' }, { tlift_contract_details: { 1: { months: 'broken' } } }]) {
  test(`invalid data shape ${Object.keys(entries)[0]} leaves storage untouched`, async ({ page, baseURL }) => {
    await sandbox(page, baseURL!);
    const result = await page.evaluate(entries => {
      const before = { ...localStorage };
      let rejected = false;
      try { (window as any).testApi.backup.restoreBackupData({ format: 'tlift-full-backup', version: 1, createdAt: new Date().toISOString(), entries }); }
      catch { rejected = true; }
      return { before, after: { ...localStorage }, rejected };
    }, entries);
    expect(result.rejected).toBe(true);
    expect(result.after).toEqual(result.before);
  });
}

// One technician works on one service at a time. The in-progress list is a shared array that every
// device syncs; merging stale copies must never give one person two services.
const ACTIVE_KEY = 'tlift_active_service_assignments_v1';
const inProgress = (contractId: number, technicianName: string, startedAt: number) => ({ contractId, monthId: 1, technicianName, startedAt, buildingName: `ساختمان ${contractId}` });

test('409 retry merges in-progress lists: everybody is kept, but one person never has two services (newest start wins)', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  const person = 'همکار آزمایشی';
  server.conflict = { key: ACTIVE_KEY, updated_at: '2026-09-28T00:00:00Z', data: [inProgress(1, person, 1000), inProgress(7, 'همکار دیگر', 1200)] };
  await page.evaluate(async ({ key, name, row }) => {
    const sync = (window as any).testApi.sync;
    sync.pushKey(key, [row]);
    sync.setManualOffline(false);
    await sync.flushAll();
  }, { key: ACTIVE_KEY, name: person, row: inProgress(2, person, 5000) });
  await expect.poll(() => queue(page)).toEqual({});
  const saved = server.rows.get(ACTIVE_KEY).data;
  expect(saved.map((item: any) => item.contractId).sort()).toEqual([2, 7]);
  expect(saved.filter((item: any) => item.technicianName === person)).toHaveLength(1);
});

test('pulling a server list with several in-progress services for one person keeps the newest only', async ({ page, baseURL }) => {
  const server = await sandbox(page, baseURL!);
  server.rows.set(ACTIVE_KEY, { key: ACTIVE_KEY, updated_at: '2026-09-29T00:00:00Z', data: [
    inProgress(1, 'محمد حسن رحیمی‌زاده', 100), inProgress(2, 'محمد حسن رحیمی زاده', 300), inProgress(3, 'محمد حسن رحیمی زاده', 200), inProgress(9, 'همکار دیگر', 50),
  ] });
  await page.evaluate(async () => {
    const sync = (window as any).testApi.sync;
    sync.setManualOffline(false);
    await sync.pullAll();
  });
  const shown = await page.evaluate(() => (window as any).testApi.appStore.getActiveServiceAssignments().map((item: any) => item.contractId).sort());
  expect(shown).toEqual([2, 9]);
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), ACTIVE_KEY)).map((item: any) => item.contractId).sort()).toEqual([2, 9]);
});

test('store: a second service for the same person is refused (nothing is silently replaced); the same service and other people are fine', async ({ page, baseURL }) => {
  await sandbox(page, baseURL!);
  const result = await page.evaluate((key) => {
    const store = (window as any).testApi.appStore;
    const row = (contractId: number, name: string, startedAt: number) => ({ contractId, monthId: 1, technicianName: name, startedAt, buildingName: `B${contractId}` });
    const out: Record<string, unknown> = {};
    out.first = store.startActiveService(row(1, 'محمد رحیمی‌زاده', 100));
    out.secondSamePerson = store.startActiveService(row(2, 'محمد رحیمی زاده', 200));   // other spelling, same person
    out.sameServiceAgain = store.startActiveService(row(1, 'محمد رحیمی‌زاده', 100));
    out.otherPerson = store.startActiveService(row(3, 'همکار دیگر', 300));
    out.afterStart = store.getActiveServiceAssignments().map((item: any) => item.contractId);
    store.finishActiveService(1, 1, 'محمد رحیمی زاده');                                    // finishing clears the person's record
    out.afterFinish = store.getActiveServiceAssignments().map((item: any) => item.contractId);
    out.stored = JSON.parse(localStorage.getItem(key) || '[]').map((item: any) => item.contractId);
    return out;
  }, ACTIVE_KEY);
  expect(result).toEqual({ first: true, secondSamePerson: false, sameServiceAgain: true, otherPerson: true, afterStart: [1, 3], afterFinish: [3], stored: [3] });
});

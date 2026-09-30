import { test, expect, type Page } from '@playwright/test';

test.use({ baseURL: process.env.INTEGRATION_BASE_URL || 'http://127.0.0.1:4174' });
const entry = '/tests/harness/index.html';
async function isolate(page: Page, baseURL: string, role = 'admin') {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });
  await page.addInitScript(role => {
    (window as any).__TLIFT_TEST_ISOLATED__ = true;
    if (sessionStorage.getItem('materials_seeded')) return;
    sessionStorage.setItem('materials_seeded', '1');
    const part = (id: number, code: string, name: string, price: number, stock = 0) => ({ id, code, name, price, stock, minimumStock: 0, unit: 'عدد', alias: '', desc: 'keep original description', brand: '', country: '', consumable: true });
    const data = {
      tlift_manual_offline_v1: true, tlift_csv_seeded_v1: true, tlift_cust_csv_seeded_v1: true,
      tlift_parts: [part(6, '29454', 'قفل درب طبقه', 15000000), part(8, '29756', 'قفل طبقه', 20000000), part(500, 'CUSTOM', 'قطعه اختصاصی آزمایشی', 900, 7)],
      tlift_customer_session: { id: 'catalog-admin', name: 'مدیر آزمایشی', role, phone: '09000000000' },
      tlift_contracts: [{ id: 990001, no: 'TEST-001', building: 'ساختمان آزمایشی', manager: 'مدیر آزمایشی', zone: 'آزمایشی', start: '1405/01/01', end: '1405/12/29', kind: 'general' }],
      tlift_contract_details: { 990001: { months: [{ id: 1, m: 'فروردین', y: 1405, done: true, paid: false, amount: 1000000, report: 'گزارش قدیمی محفوظ', partsList: [{ code: '29454', name: 'قفل درب طبقه', unit: 'عدد', qty: 1, price: 15000000 }] }], payments: [], breakdowns: [], invoices: [] } },
      tlift_technician_part_deliveries_v1: [{ id: 'delivery-old', technicianName: 'مدیر آزمایشی', partId: 6, partCode: '29454', partName: 'قفل درب طبقه', unit: 'عدد', quantity: 3, usedQuantity: 0, remainingQuantity: 3, deliveredAt: '1405/01/01', status: 'active' }],
      tlift_offline_queue_v2: { tlift_test_pending: { report: 'صف قبلی محفوظ' } },
    };
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, JSON.stringify(value));
  }, role);
  await page.goto(entry);
  await expect.poll(() => page.evaluate(() => !!(window as any).testApi?.partsApi)).toBe(true);
  return errors;
}
async function openParts(page: Page) {
  await page.getByRole('button', { name: 'سرویس و نگهداری', exact: true }).hover();
  await page.getByRole('button', { name: 'قطعات مصرفی', exact: true }).click();
  await page.getByRole('button', { name: 'بررسی و اعمال فهرست قطعات' }).click();
}

test('manager reviews 108 items, applies import and searches an old source code', async ({ page, baseURL }) => {
  const errors = await isolate(page, baseURL!);
  await openParts(page);
  await expect(page.getByRole('dialog')).toContainText('بازبینی ادغام قطعات و قیمت‌ها');
  await expect(page.getByRole('dialog').locator('tbody tr')).toHaveCount(108);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'اعمال فهرست روی قطعات من', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('فهرست ذخیره شد');
  await page.getByRole('button', { name: 'بستن بازبینی قطعات' }).click();
  await page.getByPlaceholder('جستجوی نام یا کد کالا...').fill('۲۹۴۵۴');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('۲۵٬۰۰۰٬۰۰۰');
  expect(errors).toEqual([]);
});

test('migration is backed up, queued once, idempotent and preserves historical service/delivery data', async ({ page, baseURL }) => {
  await isolate(page, baseURL!);
  const result = await page.evaluate(() => {
    const api = (window as any).testApi.partsApi;
    const old = localStorage.getItem('tlift_parts');
    const details = localStorage.getItem('tlift_contract_details');
    const deliveries = localStorage.getItem('tlift_technician_part_deliveries_v1');
    api.applyMaterialImport();
    const first = localStorage.getItem('tlift_parts');
    const next = api.applyMaterialImport();
    return { old, backup: localStorage.getItem('tlift_parts_before_material_catalog_v1__backup'), first, second: localStorage.getItem('tlift_parts'),
      noop: next.added + next.updated + next.archived, active: api.all().length,
      preserved: details === localStorage.getItem('tlift_contract_details') && deliveries === localStorage.getItem('tlift_technician_part_deliveries_v1'),
      queue: JSON.parse(localStorage.getItem('tlift_offline_queue_v2')!), custom: api.all().find((p: any) => p.id === 500) };
  });
  expect(result.backup).toBe(result.old);
  expect(result.first).toBe(result.second);
  expect(result.noop).toBe(0);
  expect(result.active).toBe(109);
  expect(result.preserved).toBe(true);
  expect(result.custom.stock).toBe(7);
  expect(result.queue.tlift_test_pending.report).toBe('صف قبلی محفوظ');
  expect(result.queue.tlift_parts.find((p: any) => p.id === 6).mergedInto).toBe(8);
  await page.reload();
  await expect.poll(() => page.evaluate(() => (window as any).testApi?.partsApi.all().length)).toBe(109);
});

for (const failedKey of ['tlift_parts', 'tlift_offline_queue_v2']) {
test(`quota failure on ${failedKey} does not change the current catalog or pending queue`, async ({ page, baseURL }) => {
  await isolate(page, baseURL!);
  const result = await page.evaluate(failedKey => {
    const api = (window as any).testApi.partsApi;
    const before = localStorage.getItem('tlift_parts');
    const queue = localStorage.getItem('tlift_offline_queue_v2');
    const visible = JSON.stringify(api.all());
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === failedKey) throw new DOMException('Synthetic full storage', 'QuotaExceededError');
      return original.call(this, key, value);
    };
    let failed = false;
    try { api.applyMaterialImport(); } catch { failed = true; }
    finally { Storage.prototype.setItem = original; }
    return { failed, unchanged: before === localStorage.getItem('tlift_parts') && queue === localStorage.getItem('tlift_offline_queue_v2') && visible === JSON.stringify(api.all()) };
  }, failedKey);
  expect(result).toEqual({ failed: true, unchanged: true });
});

}

test('old archived delivery ID returns stock to canonical item; future service consumes equivalent old-code delivery', async ({ page, baseURL }) => {
  await isolate(page, baseURL!);
  const result = await page.evaluate(() => {
    const { partsApi, appStore } = (window as any).testApi;
    partsApi.applyMaterialImport();
    const returned = partsApi.adjustStock(6, 2);
    appStore.consumeTechnicianParts('مدیر آزمایشی', [{ code: '29756', name: 'قفل درب طبقه', unit: 'عدد', qty: 1, price: 25000000 }]);
    return { returned, stock: partsApi.all().find((p: any) => p.id === 8).stock, delivery: appStore.getTechnicianPartDeliveries()[0] };
  });
  expect(result.returned).toBe(true);
  expect(result.stock).toBe(2);
  expect(result.delivery.usedQuantity).toBe(1);
  expect(result.delivery.partId).toBe(6);
});

test('mobile service picker finds former code and selects the higher-price canonical part', async ({ page, baseURL }) => {
  const errors = await isolate(page, baseURL!);
  await page.evaluate(() => (window as any).testApi.partsApi.applyMaterialImport());
  await page.getByRole('button', { name: 'نمای موبایل', exact: true }).click();
  await page.getByRole('button', { name: 'شروع کار', exact: true }).click();  // a service never starts before the workday (3.36.15)
  await page.getByRole('button', { name: 'نمایش سایر امکانات', exact: true }).click();
  await page.getByText('ثبت سرویس آفلاین', { exact: true }).click();
  await page.getByPlaceholder('نام مشتری یا ساختمان...').fill('ساختمان آزمایشی');
  await page.getByRole('button', { name: 'شروع ثبت آفلاین', exact: true }).click();
  await page.getByRole('button', { name: 'قطعات', exact: true }).click();
  await page.getByRole('button', { name: '+ انتخاب قطعه', exact: true }).click();
  await page.getByPlaceholder('جستجوی قطعه...').fill('29454');
  await page.getByRole('button', { name: /قفل درب طبقه/ }).click();
  await expect(page.getByText('قفل درب طبقه', { exact: true })).toBeVisible();
  await expect(page.getByText('۲۵٬۰۰۰٬۰۰۰ ریال / عدد', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('non-admin can view the report but cannot apply catalog changes', async ({ page, baseURL }) => {
  await isolate(page, baseURL!, 'operator');
  await openParts(page);
  await expect(page.getByRole('button', { name: 'اعمال فهرست روی قطعات من', exact: true })).toHaveCount(0);
  await expect(page.getByText('اعمال فهرست توسط مدیر انجام می‌شود.')).toBeVisible();
});

test('same oil name with litre/number units does not consume the wrong inventory', async ({ page, baseURL }) => {
  await isolate(page, baseURL!);
  const result = await page.evaluate(() => {
    const store = (window as any).testApi.appStore;
    const item = store.addTechnicianPartDelivery({ technicianName: 'مدیر آزمایشی', partCode: '1', partName: 'روغن دو زمانه', unit: 'عدد', quantity: 3, usedQuantity: 0, remainingQuantity: 3, deliveredAt: '1405/01/01', status: 'active' });
    store.consumeTechnicianParts('مدیر آزمایشی', [{ name: 'روغن دو زمانه', code: '45158', unit: 'لیتر', qty: 1, price: 2200000 }]);
    return store.getTechnicianPartDeliveries().find((p: any) => p.id === item.id);
  });
  expect(result.usedQuantity).toBe(0);
  expect(result.remainingQuantity).toBe(3);
});

test('new device has the full 108-item catalog without losing stable legacy IDs', async ({ page, baseURL }) => {
  await isolate(page, baseURL!);
  await page.evaluate(() => localStorage.removeItem('tlift_parts')); // synthetic context only
  await page.reload();
  await expect.poll(() => page.evaluate(() => (window as any).testApi?.partsApi.all().length)).toBe(108);
  const list = await page.evaluate(() => (window as any).testApi.partsApi.all());
  expect(list.find((p: any) => p.code === '1')).toMatchObject({ id: 1, price: 4000000, unit: 'عدد' });
  expect(list.find((p: any) => p.code === '29039')).toMatchObject({ id: 8, price: 5000000 });
});

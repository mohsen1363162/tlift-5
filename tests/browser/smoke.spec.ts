import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;

// Every test uses a fresh browser context and synthetic storage. No live API,
// real session, PHP endpoint or bundled production bootstrap data is contacted.
async function isolate(page: Page, baseURL: string, signedIn = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) {
      return route.abort();
    }
    if (url.pathname === '/data/tlift-bootstrap.json') {
      return route.fulfill({ json: { entries: {} } });
    }
    return route.continue();
  });
  await page.addInitScript(({ signedIn }) => {
    if (sessionStorage.getItem('smoke_seeded')) return;
    sessionStorage.setItem('smoke_seeded', '1');
    localStorage.setItem('tlift_manual_offline_v1', 'true');
    localStorage.setItem('tlift_offline_queue_v2', JSON.stringify({ smoke_pending: { report: 'گزارش آزمایشی' } }));
    localStorage.setItem('tlift_offline_services_v1', JSON.stringify([{
      id: 'smoke-offline', contractId: 990001, monthId: 1,
      buildingName: 'ساختمان آزمایشی', doneDate: '1405/01/01', amount: 1000000, recordedAt: 1,
    }]));
    localStorage.setItem('tlift_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_contracts', JSON.stringify([{
      id: 990001, no: 'SMOKE-001', building: 'ساختمان آزمایشی', manager: 'مدیر آزمایشی',
      zone: 'آزمایشی', start: '1405/01/01', end: '1405/12/29', kind: 'general',
      monthlyServiceFee: 1000000,
    }]));
    localStorage.setItem('tlift_contract_details', JSON.stringify({
      990001: { months: [1, 2].map(id => ({ id, m: id === 1 ? 'فروردین' : 'اردیبهشت', y: 1405, amount: 1000000, paid: false, done: false })), payments: [], breakdowns: [] },
    }));
    if (signedIn) localStorage.setItem('tlift_customer_session', JSON.stringify({
      id: 'smoke-admin', name: 'کاربر آزمایشی', role: 'admin', phone: '09000000000',
    }));
  }, { signedIn });
  return errors;
}

test('login renders instead of an empty page', async ({ page, baseURL }) => {
  const errors = await isolate(page, baseURL!);
  await page.goto('/');
  await expect(page.getByText('فرم ورود شرکت آسمان‌سرا')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ورود به سیستم', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('desktop renders with a synthetic saved admin session', async ({ page, baseURL }) => {
  const errors = await isolate(page, baseURL!, true);
  await page.goto('/');
  await expect(page.getByText('کاربر آزمایشی').first()).toBeVisible();
  await expect(page.locator('#root')).toContainText(version);
  expect(errors).toEqual([]);
});

test('mobile renders and opens service list with numeric contract IDs', async ({ page, baseURL }) => {
  const errors = await isolate(page, baseURL!, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?mode=mobile');
  await page.getByText('ثبت سرویس', { exact: true }).click();
  await expect(page.getByText('ساختمان آزمایشی').first()).toBeVisible();
  await page.getByText('مشاهده و انتخاب ماه دیگر', { exact: true }).first().click();
  await expect(page.getByText('بستن ماه‌ها', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});


test('offline queue and stored service survive a browser reload', async ({ page, baseURL }) => {
  const errors = await isolate(page, baseURL!, true);
  await page.goto('/');
  await expect(page.getByText('کاربر آزمایشی').first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('کاربر آزمایشی').first()).toBeVisible();
  const stored = await page.evaluate(() => ({
    queue: JSON.parse(localStorage.getItem('tlift_offline_queue_v2') || '{}'),
    services: JSON.parse(localStorage.getItem('tlift_offline_services_v1') || '[]'),
    contracts: JSON.parse(localStorage.getItem('tlift_contracts') || '[]'),
  }));
  expect(stored.queue.smoke_pending).toEqual({ report: 'گزارش آزمایشی' });
  expect(stored.services).toContainEqual({ id: 'smoke-offline', contractId: 990001, monthId: 1,
    buildingName: 'ساختمان آزمایشی', doneDate: '1405/01/01', amount: 1000000, recordedAt: 1 });
  expect(stored.contracts).toEqual(expect.arrayContaining([expect.objectContaining({ id: 990001, no: 'SMOKE-001' })]));
  expect(errors).toEqual([]);
});

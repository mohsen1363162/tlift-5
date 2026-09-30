import { test, expect, type Page } from '@playwright/test';

// Rules for starting a service in the technician view:
//   1) nothing starts until the workday has been started («شروع کار») – a warning explains it;
//   2) one technician works on one service at a time – the next one starts after the first is finished/cancelled.
// Synthetic data only; the network is cut off except for the local preview.

const TECH = 'همکار آزمایشی';
type Assignment = { contractId: number; monthId: number; technicianName: string; startedAt: number; buildingName: string };
type Seed = { dayStarted?: boolean; contracts?: number; months?: number; assignments?: Assignment[] };

async function open(page: Page, baseURL: string, seed: Seed = {}) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });
  await page.addInitScript((s: Seed) => {
    if (window.top !== window.self) return;
    if (sessionStorage.getItem('rules_seeded')) return; // seed once per tab so reloads keep the saved state
    sessionStorage.setItem('rules_seeded', '1');
    localStorage.setItem('tlift_manual_offline_v1', 'true');
    localStorage.setItem('tlift_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_customer_session', JSON.stringify({ id: 'test', name: 'همکار آزمایشی', role: 'admin', phone: '09000000000' }));
    const ids = Array.from({ length: s.contracts || 2 }, (_, index) => 990001 + index);
    localStorage.setItem('tlift_contracts', JSON.stringify(ids.map((id, index) => ({
      id, no: `TEST-${index + 1}`, building: `ساختمان شماره ${index + 1}`, manager: 'مدیر آزمایشی', address: 'آدرس آزمایشی بدون داده واقعی',
      zone: 'آزمایشی', monthlyServiceFee: 1000000, kind: 'general', start: '1404/01/01', end: '1405/12/29',
    }))));
    localStorage.setItem('tlift_contract_details', JSON.stringify(Object.fromEntries(ids.map(id => [id, {
      months: [
        { id: 1, m: 'فروردین', y: 1404, done: false, paid: false, amount: 1000000, plannedDate: '1404/01/01', deviceNo: 'A' },
        { id: 2, m: 'اردیبهشت', y: 1404, done: false, paid: false, amount: 1000000, plannedDate: '1404/02/01', deviceNo: 'A' },
      ].slice(0, s.months || 1),
      payments: [], invoices: [], breakdowns: [],
    }]))));
    if (s.dayStarted) localStorage.setItem('tlift_mobile_day_start', String(Date.now() - 60000));
    if (s.assignments) localStorage.setItem('tlift_active_service_assignments_v1', JSON.stringify(s.assignments));
  }, seed);
  await page.goto('/');
  return errors;
}

const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });
const row = (page: Page, building: string) => page.locator('.classic-job-row', { hasText: building }).first();
const stored = (page: Page): Promise<Assignment[]> => page.evaluate(() => JSON.parse(localStorage.getItem('tlift_active_service_assignments_v1') || '[]'));
const minutesAgo = (minutes: number) => Date.now() - minutes * 60000;
const assignment = (contractId: number, technicianName: string, startedAt: number): Assignment => ({ contractId, monthId: 1, technicianName, startedAt, buildingName: `ساختمان شماره ${contractId - 990000}` });

test('before «شروع کار» the service does not start: a warning appears, nothing is recorded, and the workday is not started automatically', async ({ page, baseURL }) => {
  const errors = await open(page, baseURL!);
  await row(page, 'ساختمان شماره 1').click();
  await button(page, 'شروع سرویس').click();

  const warning = page.getByRole('alertdialog', { name: 'ابتدا «شروع کار» را بزنید' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('هیچ سرویسی شروع نمی‌شود');
  await expect(page.locator('.classic-page-title')).toContainText('قرارداد');       // still on the job page
  expect(await stored(page)).toEqual([]);                                             // no in-progress record
  await expect(page.getByText('روز کاری شروع شد')).toHaveCount(0);                   // the day was not started for the user
  await expect(page.locator('.classic-clock')).toContainText('شروع کار');
  await warning.getByRole('button', { name: 'بستن' }).click();
  await expect(warning).toHaveCount(0);

  // pressing the real «شروع کار» button unlocks the service
  await button(page, 'شروع کار').click();
  await expect(page.locator('.classic-clock')).not.toContainText('شروع کار');
  await button(page, 'شروع سرویس').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  expect((await stored(page)).map(item => item.technicianName)).toEqual([TECH]);
  expect(errors).toEqual([]);
});

test('the start button inside the warning starts only the workday; the service still needs its own tap', async ({ page, baseURL }) => {
  await open(page, baseURL!);
  await row(page, 'ساختمان شماره 1').click();
  await button(page, 'شروع سرویس').click();
  const warning = page.getByRole('alertdialog', { name: 'ابتدا «شروع کار» را بزنید' });
  await warning.getByRole('button', { name: 'شروع کار روز' }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByText('روز کاری شروع شد')).toBeVisible();
  await expect(page.locator('.classic-clock')).not.toContainText('شروع کار');
  await expect(page.locator('.classic-page-title')).toContainText('قرارداد');
  expect(await stored(page)).toEqual([]);
  await button(page, 'شروع سرویس').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  expect(await stored(page)).toHaveLength(1);
});

test('every other way to start is blocked too: services list, other-month button and offline registration', async ({ page, baseURL }) => {
  await open(page, baseURL!, { months: 2 });
  const warning = page.getByRole('alertdialog', { name: 'ابتدا «شروع کار» را بزنید' });

  await button(page, 'ثبت سرویس').click();                                              // services list
  await button(page, /شروع سرویس خارج از نوبت/).first().click();
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'بستن' }).click();
  await page.getByText('مشاهده و انتخاب ماه دیگر', { exact: true }).first().click();  // another month of the contract
  await page.getByText('شروع این ماه', { exact: true }).first().click();
  await expect(warning).toBeVisible();
  await warning.getByRole('button', { name: 'بستن' }).click();
  expect(await stored(page)).toEqual([]);

  await button(page, 'بازگشت').click();                                                 // offline registration from the home page
  await button(page, 'نمایش سایر امکانات').click();
  await page.getByText('ثبت سرویس آفلاین', { exact: true }).click();
  await page.getByPlaceholder('نام مشتری یا ساختمان...').fill('مشتری آزمایشی');
  await button(page, 'شروع ثبت آفلاین').click();
  await expect(warning).toBeVisible();
  await expect(page.locator('.classic-page-title')).toHaveText('ثبت سرویس آفلاین');
  await expect(page.locator('.classic-clock')).toContainText('شروع کار');
});

test('one service at a time: while one is in progress the next cannot start; the warning leads to it or cancels it', async ({ page, baseURL }) => {
  const errors = await open(page, baseURL!, { dayStarted: true, assignments: [assignment(990001, TECH, minutesAgo(10))] });
  await expect(page.getByText('در حال انجام — ساختمان شماره 1')).toBeVisible();

  await row(page, 'ساختمان شماره 2').click();
  await button(page, 'شروع سرویس').click();
  const warning = page.getByRole('alertdialog', { name: 'سرویس قبلی هنوز در حال انجام است' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('ساختمان شماره 1');
  await expect(warning).toContainText('هم‌زمان فقط یک سرویس');
  expect((await stored(page)).map(item => item.contractId)).toEqual([990001]);           // the second one was not recorded
  await expect(page.locator('.classic-page-title')).toContainText('قرارداد');

  // «continue» goes to the running service without touching the record
  await warning.getByRole('button', { name: 'ادامهٔ سرویس در حال انجام' }).click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  expect((await stored(page)).map(item => item.contractId)).toEqual([990001]);
  await button(page, 'بازگشت').click();
  await button(page, 'بازگشت').click();

  // cancelling the running service frees the technician for the next one
  await row(page, 'ساختمان شماره 2').click();
  await button(page, 'شروع سرویس').click();
  page.once('dialog', dialog => dialog.accept());
  await warning.getByRole('button', { name: 'لغو سرویس در حال انجام' }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByText('سرویس در حال انجام لغو شد')).toBeVisible();
  expect(await stored(page)).toEqual([]);
  await button(page, 'شروع سرویس').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  expect((await stored(page)).map(item => item.contractId)).toEqual([990002]);
  expect(errors).toEqual([]);
});

test('an offline service in progress blocks the next start too: a message appears and nothing is recorded', async ({ page, baseURL }) => {
  const errors = await open(page, baseURL!, { dayStarted: true });
  await button(page, 'نمایش سایر امکانات').click();
  await page.getByText('ثبت سرویس آفلاین', { exact: true }).click();
  await page.getByPlaceholder('نام مشتری یا ساختمان...').fill('مشتری آزمایشی');
  await button(page, 'شروع ثبت آفلاین').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  for (let step = 0; step < 4 && await button(page, 'بازگشت').count(); step++) await button(page, 'بازگشت').first().click();
  await expect(page.getByText('در حال انجام — مشتری آزمایشی')).toBeVisible();          // the running offline service stays on the home card

  await button(page, 'ثبت سرویس').click();
  await button(page, /شروع سرویس خارج از نوبت/).first().click();
  await expect(page.getByText('ابتدا سرویس آفلاین در حال انجام را پایان دهید')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('.classic-page-title')).not.toHaveText('انجام سرویس');
  expect(await stored(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a person with several in-progress records (old data or a sync merge) is shown on one service only, the newest; other people are untouched', async ({ page, baseURL }) => {
  const person = 'محمد حسن رحیمی زاده';
  await open(page, baseURL!, {
    dayStarted: true, contracts: 4,
    assignments: [
      assignment(990001, 'محمد حسن رحیمی‌زاده', minutesAgo(180)),   // same person, spelled with a half-space
      assignment(990002, person, minutesAgo(120)),
      assignment(990003, person, minutesAgo(30)),                   // newest start
      assignment(990004, 'همکار دیگر', minutesAgo(200)),            // another person: kept
    ],
  });
  const badge = 'در حال انجام توسط';
  await expect(page.locator('.classic-job-row', { hasText: badge })).toHaveCount(2);
  await expect(row(page, 'ساختمان شماره 3')).toContainText(`${badge} ${person}`);
  await expect(row(page, 'ساختمان شماره 4')).toContainText(`${badge} همکار دیگر`);
  await expect(row(page, 'ساختمان شماره 1')).toContainText('انجام‌نشده');
  await expect(row(page, 'ساختمان شماره 2')).toContainText('انجام‌نشده');

  // the other person's service cannot be started by this technician
  await row(page, 'ساختمان شماره 4').click();
  await button(page, 'شروع سرویس').click();
  await expect(page.getByText('این سرویس در حال انجام توسط همکار دیگر است')).toBeVisible();
});

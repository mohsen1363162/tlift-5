import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Guard against the 3.36.12 regression: a redesign must never hide or delete an existing
// capability (triangle key, assigned jobs, daily report, dispatch, offline queue, tools...).

const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;

type Seed = { manualOffline?: boolean; queuedService?: boolean; deviceOffline?: boolean };

async function open(page: Page, baseURL: string, seed: Seed = {}, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.routeWebSocket('**/*', socket => socket.close());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });
  await page.addInitScript((s: Seed) => {
    if (window.top !== window.self) return;
    if (s.deviceOffline) Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    if (sessionStorage.getItem('parity_seeded')) return; // seed once per tab so reloads keep saved edits
    sessionStorage.setItem('parity_seeded', '1');
    if (s.manualOffline) localStorage.setItem('tlift_manual_offline_v1', 'true');
    if (s.queuedService) {
      localStorage.setItem('tlift_offline_services_v1', JSON.stringify([{
        id: 'parity-offline', contractId: 990001, monthId: 1,
        buildingName: 'ساختمان آزمایشی', doneDate: '1405/01/01', amount: 1000000, recordedAt: 1,
      }]));
    }
    localStorage.setItem('tlift_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_customer_session', JSON.stringify({ id: 'test', name: 'همکار آزمایشی', role: 'admin', phone: '09000000000' }));
    localStorage.setItem('tlift_contracts', JSON.stringify([{ id: 990001, no: 'TEST-42', building: 'ساختمان آزمایشی', manager: 'مدیر آزمایشی', address: 'آدرس آزمایشی بدون داده واقعی', zone: 'آزمایشی', monthlyServiceFee: 1234567, kind: 'general', start: '1404/01/01', end: '1405/12/29' }]));
    localStorage.setItem('tlift_contract_details', JSON.stringify({ 990001: { months: [{ id: 1, m: 'فروردین', y: 1404, done: false, paid: false, amount: 1234567, plannedDate: '1404/01/01', deviceNo: 'A' }], payments: [], invoices: [], breakdowns: [] } }));
  }, seed);
  await page.goto('/');
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'ناوبری موبایل' });
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

test('triangle key section: one tap from home, search, save location and dates, persists, back to home', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, baseURL!, { manualOffline: true });

  // visible immediately on the home screen: no toggle needed
  await expect(button(page, 'کلید سه‌گوش')).toBeVisible();
  await button(page, 'کلید سه‌گوش').click();
  await expect(page.locator('.classic-page-title')).toHaveText('محل کلید سه‌گوش');
  await expect(page.getByText('جستجوی سریع کلید نجات اضطراری')).toBeVisible();

  await page.getByPlaceholder('نام ساختمان، مشتری یا شماره قرارداد').fill('آزمایشی');
  await expect(page.locator('body')).toContainText('محل کلید: ثبت نشده');
  await button(page, 'ثبت محل کلید').click();
  await page.getByPlaceholder('مثلاً داخل جعبه آتش‌نشانی طبقه همکف').fill('پشت درب موتورخانه');
  const dateInputs = page.locator('input[placeholder="۱۴۰۵/۰۷/۱۵"]');
  await dateInputs.nth(0).fill('1405/07/15');
  await button(page, '+').nth(0).click();
  await dateInputs.nth(1).fill('1405/07/20');
  await button(page, '+').nth(1).click();
  await button(page, 'ذخیره').click();
  await expect(page.getByText('محل کلید سه‌گوش ذخیره شد')).toBeVisible();
  await expect(page.locator('body')).toContainText('محل کلید: پشت درب موتورخانه');
  await expect(page.locator('body')).toContainText('1405/07/15');
  await expect(page.locator('body')).toContainText('1405/07/20');

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tlift_contracts') || '[]').find((c: any) => c.id === 990001)))
    .toMatchObject({ triangleKeyLocation: 'پشت درب موتورخانه', cleaningDates: ['1405/07/15'], motorOilChangeDates: ['1405/07/20'] });

  // back goes to Home (its only entry point), not to another screen
  await button(page, 'بازگشت').click();
  await expect(nav(page)).toBeVisible();
  await expect(button(page, 'کلید سه‌گوش')).toBeVisible();

  // the saved key location is also shown in the service details table
  await page.locator('.classic-job-row').first().click();
  await expect(page.locator('.classic-detail-table')).toContainText('محل کلید سه‌گوش');
  await expect(page.locator('.classic-detail-table')).toContainText('پشت درب موتورخانه');

  // and it is still there after a reload
  await page.reload();
  await button(page, 'کلید سه‌گوش').click();
  await page.getByPlaceholder('نام ساختمان، مشتری یا شماره قرارداد').fill('آزمایشی');
  await expect(page.locator('body')).toContainText('محل کلید: پشت درب موتورخانه');
  expect(errors).toEqual([]);
});

for (const width of [360, 480]) {
  test(`every action of the previous home is visible or one tap away, at ${width}px`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await open(page, baseURL!, { manualOffline: true }, width);

    // visible by default, no toggle
    for (const name of ['ثبت سرویس', 'ثبت خرابی', 'لیست خرابی', 'کلید سه‌گوش', 'کارهای واگذارشده من', 'گزارش روزانه من', 'تقسیم کار روزانه']) {
      await expect(button(page, name), name).toBeVisible();
    }
    await expect(page.locator('.classic-home-actions > button')).toHaveCount(3);
    await expect(page.locator('.classic-home-extra > button')).toHaveCount(4);
    await expect(nav(page).getByRole('button')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // the rarely used ones stay behind the existing toggle, exactly as before
    await button(page, 'نمایش سایر امکانات').click();
    for (const name of ['ثبت سرویس آفلاین', 'صف سرویس‌های آفلاین', 'قطعات تحویلی من']) await expect(button(page, name), name).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const screens: Array<[string, string]> = [
      ['ثبت سرویس', 'سرویس‌ها (خارج از نوبت)'],
      ['لیست خرابی', 'سرویس‌ها (خارج از نوبت)'],
      ['ثبت خرابی', 'سرویس‌ها (خارج از نوبت)'],
      ['کلید سه‌گوش', 'محل کلید سه‌گوش'],
      ['کارهای واگذارشده من', 'کارهای واگذارشده من'],
      ['گزارش روزانه من', 'گزارش روزانه من'],
      ['تقسیم کار روزانه', 'تقسیم کار روزانه'],
      ['ثبت سرویس آفلاین', 'ثبت سرویس آفلاین'],
      ['صف سرویس‌های آفلاین', 'صف و تخصیص سرویس‌های آفلاین'],
      ['قطعات تحویلی من', 'قطعات و کالاهای تحویلی من'],
    ];
    for (const [card, title] of screens) {
      await button(page, card).click();
      await expect(page.locator('.classic-page-title'), `${card} → ${title}`).toHaveText(title);
      await button(page, 'بازگشت').click();
      await expect(nav(page)).toBeVisible();
      await expect(button(page, 'کلید سه‌گوش')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test('badges of the quick actions show real counts', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true });
  await page.evaluate(() => {
    localStorage.setItem('tlift_unassigned_offline_services_v1', JSON.stringify([
      { id: 'draft-1', customerName: 'مشتری پیش‌نویس', createdAt: 1, doneDate: '1405/01/01', inTime: '08:00', outTime: '09:00', report: 'گزارش آزمایشی', reminder: '', followup: '', checklistResults: {}, partsList: [], faultsList: [], wage: 0, trip: 0, attachments: [] },
    ]));
  });
  await page.reload();
  await button(page, 'نمایش سایر امکانات').click();
  await expect(button(page, /صف سرویس‌های آفلاین/)).toContainText('۱');
});

test('header tools stay reachable: sync, sync interval, update and install', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true });
  await page.getByText('ابزارهای همگام‌سازی و برنامه').click();
  await expect(button(page, `بروزرسانی نرم‌افزار (v${version})`)).toBeVisible();
  await expect(button(page, 'نصب برنامه')).toBeVisible();
  await expect(button(page, 'همگام‌سازی')).toBeVisible();
  await page.getByTitle('مدت زمان همگام‌سازی').click();
  await expect(page.getByText('تنظیمات و مدت زمان همگام‌سازی')).toBeVisible();
  await expect(page.getByText('مدت زمان همگام‌سازی خودکار:')).toBeVisible();
  await expect(button(page, 'همگام‌سازی هم‌اکنون')).toBeVisible();
});

test('drawer keeps update, install, reports, sync, desktop and sign-out entries and today\'s date is on the toolbar', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true });
  await expect(page.locator('.classic-page-title')).toHaveText(/[۰-۹]+ \S+ [۰-۹]{4}/);
  await button(page, 'منوی اصلی').click();
  await expect(button(page, new RegExp(`بروزرسانی نرم‌افزار \\(آپدیت به نسخه ${version.replace(/\./g, '\\.')}\\)`))).toBeVisible();
  await expect(button(page, /نصب برنامه مستقل/)).toBeVisible();
  await expect(button(page, 'گزارشات')).toBeVisible();
  await expect(button(page, /همگام‌سازی اطلاعات/)).toBeVisible();
  await expect(button(page, 'بازگشت به نسخه دسکتاپ')).toBeVisible();
  await expect(button(page, 'خروج')).toBeVisible();
});

const bannerCases: Array<[string, Seed, string[]]> = [
  ['queued service while online: the count stays visible', { queuedService: true }, ['۱ سرویس در صف امن دستگاه؛ پس از اتصال سرور ارسال می‌شود']],
  ['manual offline mode', { manualOffline: true }, ['حالت آفلاین دستی فعال است']],
  ['device without internet: reference wording plus the reassurance that services can still be registered', { deviceOffline: true }, ['لطفاً به اینترنت متصل شوید', 'اینترنت دستگاه قطع است — می‌توانید سرویس را ثبت کنید']],
];
for (const [title, seed, expected] of bannerCases) {
  test(`sync banner, ${title}`, async ({ page, baseURL }) => {
    await open(page, baseURL!, seed);
    const notice = page.locator('.classic-sync-notice');
    for (const text of expected) await expect(notice).toContainText(text);
    await expect(notice.getByRole('button', { name: 'همگام سازی', exact: true })).toBeVisible();
  });
}

test('job rows keep the service period next to the status', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true });
  const row = page.locator('.classic-job-row').first();
  await expect(row).toContainText('سرویس فروردین 1404');
  await expect(row).toContainText('انجام‌نشده');
  await expect(row.locator('.classic-job-status > span').first()).toBeVisible();
});

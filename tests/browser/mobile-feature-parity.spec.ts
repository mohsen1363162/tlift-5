import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Guard against the 3.36.12 regression: a redesign must never hide or delete an existing
// capability (triangle key, assigned jobs, daily report, dispatch, offline queue, tools...).

const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version;

type Seed = { manualOffline?: boolean; queuedService?: boolean; deviceOffline?: boolean; contract?: Record<string, unknown> };

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
    localStorage.setItem('tlift_contracts', JSON.stringify([{ id: 990001, no: 'TEST-42', building: 'ساختمان آزمایشی', manager: 'مدیر آزمایشی', address: 'آدرس آزمایشی بدون داده واقعی', zone: 'آزمایشی', monthlyServiceFee: 1234567, kind: 'general', start: '1404/01/01', end: '1405/12/29', ...(s.contract || {}) }]));
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
  await expect(button(page, 'نصب برنامه T_lift')).toBeVisible();
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

test('in-progress service: play turns into pause after coming back from the work screen and continues without restarting', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, baseURL!, { manualOffline: true });
  const actions = page.locator('.classic-map-actions');

  await page.locator('.classic-job-row').first().click();
  await expect(button(page, 'شروع سرویس')).toBeVisible();
  await expect(actions.locator('svg.lucide-play')).toHaveCount(1);
  await expect(actions.locator('svg.lucide-pause')).toHaveCount(0);

  await button(page, 'شروع کار').click(); // a service can only start after the workday has started
  await button(page, 'شروع سرویس').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  await button(page, 'قطعات').click(); // the parts tab, then back
  await button(page, 'بازگشت').click();

  // back on the job page: two bars instead of the play triangle
  await expect(page.locator('.classic-page-title')).toContainText('قرارداد');
  await expect(button(page, 'در حال انجام')).toBeVisible();
  await expect(actions.locator('svg.lucide-pause')).toHaveCount(1);
  await expect(actions.locator('svg.lucide-play')).toHaveCount(0);
  await expect(button(page, 'شروع سرویس')).toHaveCount(0);
  await expect(actions.locator('button:has(svg.lucide-pause) > span:first-child')).toHaveCSS('background-color', 'rgb(8, 124, 8)');

  // the same in-progress state is shown in the services list; tapping continues the running service
  const startedAt = await page.evaluate(() => JSON.parse(localStorage.getItem('tlift_mobile_active_job') || '{}').startedAt);
  expect(startedAt).toBeGreaterThan(0);
  await button(page, 'در حال انجام').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tlift_mobile_active_job') || '{}').startedAt)).toBe(startedAt);
  await button(page, 'بازگشت').click();
  await button(page, 'بازگشت').click();
  await expect(button(page, 'ثبت سرویس')).toBeVisible();
  await button(page, 'ثبت سرویس').click();
  await expect(button(page, /ادامه سرویس در حال انجام/)).toBeVisible();
  await expect(button(page, /شروع سرویس خارج از نوبت/)).toHaveCount(0);
  await button(page, 'بازگشت').click();

  // cancelling the active service brings the play triangle back
  page.once('dialog', dialog => dialog.accept());
  await button(page, 'لغو کار فعال').click();
  await page.locator('.classic-job-row').first().click();
  await expect(button(page, 'شروع سرویس')).toBeVisible();
  await expect(actions.locator('svg.lucide-play')).toHaveCount(1);
  await expect(actions.locator('svg.lucide-pause')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('call button shows the coordinator number first (Persian digits become dialable) and keeps the manager number as a second choice', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true, contract: { coordinator: 'مسئول آزمایشی', coordinatorPhone: '۰۹۱۲ ۳۴۵ ۶۷۸۹', phone: '09350000000' } });
  await page.locator('.classic-job-row').first().click();
  await button(page, 'تماس').click();
  const dialog = page.getByRole('dialog', { name: 'تماس با مسئول هماهنگی' });
  await expect(dialog).toBeVisible();
  const cards = dialog.locator('div.rounded-xl.border');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('مسئول هماهنگی');
  await expect(cards.nth(0)).toContainText('مسئول آزمایشی');
  await expect(cards.nth(0)).toContainText('۰۹۱۲ ۳۴۵ ۶۷۸۹');
  await expect(cards.nth(0).getByRole('link', { name: 'تماس' })).toHaveAttribute('href', 'tel:09123456789');
  await expect(cards.nth(1)).toContainText('مدیر / کارفرما');
  await expect(cards.nth(1).getByRole('link', { name: 'تماس' })).toHaveAttribute('href', 'tel:09350000000');
  await expect(dialog).not.toContainText('ثبت نشده است');
  await dialog.getByRole('button', { name: 'بستن' }).click();
  await expect(dialog).toHaveCount(0);
});

test('call button: same number for both contacts is listed once; missing coordinator number is explained; no number gives a message', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true, contract: { coordinator: 'مسئول آزمایشی', coordinatorPhone: '09121111111', phone: '0912-111-1111' } });
  await page.locator('.classic-job-row').first().click();
  await button(page, 'تماس').click();
  const dialog = page.getByRole('dialog', { name: 'تماس با مسئول هماهنگی' });
  await expect(dialog.locator('div.rounded-xl.border')).toHaveCount(1);
  await expect(dialog.getByRole('link', { name: 'تماس' })).toHaveAttribute('href', 'tel:09121111111');

  const manager = await page.context().newPage();
  await open(manager, baseURL!, { manualOffline: true, contract: { phone: '09350000000' } });
  await manager.locator('.classic-job-row').first().click();
  await manager.getByRole('button', { name: 'تماس', exact: true }).click();
  const managerDialog = manager.getByRole('dialog', { name: 'تماس با مسئول هماهنگی' });
  await expect(managerDialog).toContainText('شماره مسئول هماهنگی برای این ساختمان ثبت نشده است');
  await expect(managerDialog.getByRole('link', { name: 'تماس' })).toHaveAttribute('href', 'tel:09350000000');
});

test('call button without any stored number only shows a message', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true });
  await page.locator('.classic-job-row').first().click();
  await button(page, 'تماس').click();
  await expect(page.getByText('شماره مسئول هماهنگی ثبت نشده است', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'تماس با مسئول هماهنگی' })).toHaveCount(0);
});

test('T_lift icon and name: manifests, icon files and the install buttons', async ({ page, baseURL }) => {
  await open(page, baseURL!, { manualOffline: true }, 1280); // isolated, desktop layout
  // manifests (the static one is linked from index.html; the generated one is served as well)
  for (const path of ['/manifest.json', '/manifest.webmanifest']) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    const manifest = await response.json();
    expect(manifest.name, path).toBe('T_lift');
    expect(manifest.short_name, path).toBe('T_lift');
  }
  const html = await (await page.request.get('/')).text();
  expect(html).toContain('content="T_lift"');
  expect(html).toContain('href="/apple-touch-icon.png"');

  // icon files: real PNGs of the announced size, red background with a white arrow
  const icons: Array<[string, number, boolean]> = [
    ['/icons/icon-192.png', 192, true], ['/icons/icon-512.png', 512, true],
    ['/pwa-192x192.png', 192, false], ['/pwa-512x512.png', 512, false], ['/apple-touch-icon.png', 180, false],
  ];
  for (const [path, size, rounded] of icons) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    const body = await response.body();
    expect(body.subarray(0, 8).toString('hex'), path).toBe('89504e470d0a1a0a');
    expect([body.readUInt32BE(16), body.readUInt32BE(20)], path).toEqual([size, size]);
    const pixels = await page.evaluate(async ({ path, size }) => {
      const image = new Image();
      image.src = path;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const at = (x: number, y: number) => Array.from(context.getImageData(Math.round(x * size), Math.round(y * size), 1, 1).data);
      return { corner: at(0.01, 0.01), side: at(0.12, 0.5), arrow: at(0.5, 0.5) };
    }, { path, size });
    expect(pixels.side[0], `${path} red`).toBeGreaterThan(200);
    expect(pixels.side[1], `${path} red`).toBeLessThan(90);
    expect(pixels.side[2], `${path} red`).toBeLessThan(90);
    expect(pixels.arrow.slice(0, 3), `${path} white arrow`).toEqual([255, 255, 255]);
    if (rounded) expect(pixels.corner[3], `${path} transparent corner`).toBe(0);
    else expect(pixels.corner[3], `${path} full-bleed`).toBe(255);
  }

  // desktop install button: icon + T_lift, opens the install dialog that uses the same name
  const install = page.getByRole('button', { name: 'نصب برنامه T_lift' });
  await expect(install).toBeVisible();
  await expect(install.locator('img[src="/icons/icon-192.png"]')).toBeVisible();
  await expect(install).toContainText('T_lift');
  await install.click();
  await expect(page.getByRole('heading', { name: /برنامه\s+T_lift/ })).toBeVisible();
  await expect(page.getByText('نرم‌افزار مستقل با نام «T_lift»')).toBeVisible();
});

import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// GPS coverage: the nearby map and navigation only work for buildings whose position is registered, and the bundled data has
// almost none. Two ways to fix that: the technician registers the place while servicing the building («ثبت موقعیت همین‌جا»),
// and the office imports coordinates from a CSV in «مرکز اطلاعات ناقص». Synthetic data only; network cut off except the preview.

const FIRST = 770001;
const PLACE = { latitude: 36.268801, longitude: 50.004124 };

type Seed = { contracts?: number; geo?: Array<{ index: number; latitude: number; longitude: number; accuracy?: number }>; dayStarted?: boolean; gpsRequired?: boolean };

async function open(page: Page, baseURL: string, viewport: { width: number; height: number }, seed: Seed = {}) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize(viewport);
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });
  await page.addInitScript((s: Seed & { first: number }) => {
    if (window.top !== window.self) return;
    if (sessionStorage.getItem('gps_seeded')) return; // seed once per tab so reloads keep the saved state
    sessionStorage.setItem('gps_seeded', '1');
    localStorage.setItem('tlift_manual_offline_v1', 'true');
    localStorage.setItem('tlift_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_customer_session', JSON.stringify({ id: 'test', name: 'همکار آزمایشی', role: 'admin', phone: '09000000000' }));
    const ids = Array.from({ length: s.contracts || 2 }, (_, index) => s.first + index);
    localStorage.setItem('tlift_contracts', JSON.stringify(ids.map((id, index) => ({
      id, no: `T-${index + 1}`, building: `ساختمان شماره ${index + 1}`, manager: 'مدیر آزمایشی', address: `آدرس آزمایشی ${index + 1}`,
      zone: 'آزمایشی', monthlyServiceFee: 1000000, kind: 'general', start: '1404/01/01', end: '1406/12/29',
    }))));
    localStorage.setItem('tlift_contract_details', JSON.stringify(Object.fromEntries(ids.map((id) => [id, {
      months: [{ id: 1, m: 'فروردین', y: 1404, done: false, paid: false, amount: 1000000, plannedDate: '1404/01/26', deviceNo: 'A' }],
      payments: [], invoices: [], breakdowns: [],
    }]))));
    if (s.geo) {
      localStorage.setItem('tlift_contract_geo_locations_v1', JSON.stringify(s.geo.map((item) => ({
        contractId: s.first + item.index, latitude: item.latitude, longitude: item.longitude, accuracy: item.accuracy, updatedAt: 1,
      }))));
    }
    if (s.dayStarted) localStorage.setItem('tlift_mobile_day_start', String(Date.now() - 60_000));
    if (s.gpsRequired !== undefined) localStorage.setItem('tlift_company_access_settings_v1', JSON.stringify({ gpsRequired: s.gpsRequired, gpsRadiusMeters: 300, leaders: [] }));
  }, { ...seed, first: FIRST });
  await page.goto('/');
  return errors;
}

const geoStore = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tlift_contract_geo_locations_v1') || '[]') as Array<Record<string, number>>);
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

/* ---------------------------------------------------------------------------------------------------------------- */
/*                                       technician: «ثبت موقعیت همین‌جا»                                             */
/* ---------------------------------------------------------------------------------------------------------------- */

const PHONE = { width: 390, height: 844 };
async function startServiceOfFirstBuilding(page: Page) {
  await page.locator('.classic-job-row', { hasText: 'ساختمان شماره 1' }).first().click();
  await button(page, 'شروع سرویس').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
}
const card = (page: Page) => page.getByRole('group', { name: 'ثبت موقعیت ساختمان' });

test.describe('technician, good GPS', () => {
  test.use({ geolocation: { ...PLACE, accuracy: 12 }, permissions: ['geolocation'] });

  test('one tap during the service saves the real position with its real accuracy; the card goes away; other buildings are untouched', async ({ page, baseURL }) => {
    const errors = await open(page, baseURL!, PHONE, { dayStarted: true });
    await page.locator('.classic-job-row').first().waitFor();
    await startServiceOfFirstBuilding(page);

    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText('موقعیت این ساختمان ثبت نشده است');
    expect(await geoStore(page)).toEqual([]);                                   // nothing is written before the tap

    await button(page, 'ثبت موقعیت همین‌جا').click();
    await expect(page.getByText('موقعیت «ساختمان شماره 1» ثبت شد (دقت حدود ۱۲ متر)')).toBeVisible();
    await expect(card(page)).toHaveCount(0);

    const stored = await geoStore(page);
    expect(stored).toHaveLength(1);
    expect(stored[0].contractId).toBe(FIRST);
    expect(stored[0].latitude).toBeCloseTo(PLACE.latitude, 6);
    expect(stored[0].longitude).toBeCloseTo(PLACE.longitude, 6);
    expect(stored[0].accuracy).toBe(12);                                        // the measured accuracy, not an invented "5 m"
    expect(Date.now() - stored[0].updatedAt).toBeLessThan(30_000);
    expect(errors).toEqual([]);
  });

  test('a building that already has a position never offers the card and is never overwritten', async ({ page, baseURL }) => {
    await open(page, baseURL!, PHONE, { dayStarted: true, geo: [{ index: 0, ...PLACE, accuracy: 7 }] });
    await page.locator('.classic-job-row').first().waitFor();
    await startServiceOfFirstBuilding(page);
    await expect(card(page)).toHaveCount(0);
    expect(await geoStore(page)).toEqual([{ contractId: FIRST, ...PLACE, accuracy: 7, updatedAt: 1 }]);
  });

  test('the other building, without a position, still gets its own card', async ({ page, baseURL }) => {
    await open(page, baseURL!, PHONE, { dayStarted: true, geo: [{ index: 0, ...PLACE }] });
    await page.locator('.classic-job-row').first().waitFor();
    await page.locator('.classic-job-row', { hasText: 'ساختمان شماره 2' }).first().click();
    await button(page, 'شروع سرویس').click();
    await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
    await expect(card(page)).toBeVisible();
  });
});

test.describe('technician, GPS that improves while listening', () => {
  test.use({ geolocation: { ...PLACE, accuracy: 400 }, permissions: ['geolocation'] });

  test('an approximate first fix is not saved: it keeps listening and saves as soon as the GPS gets accurate', async ({ page, baseURL, context }) => {
    await open(page, baseURL!, PHONE, { dayStarted: true });
    await page.locator('.classic-job-row').first().waitFor();
    await startServiceOfFirstBuilding(page);

    await button(page, 'ثبت موقعیت همین‌جا').click();
    await expect(button(page, /در حال دریافت موقعیت دقیق/)).toBeDisabled();       // busy, cannot be double-tapped
    await page.waitForTimeout(1200);
    expect(await geoStore(page)).toEqual([]);                                     // 400 m is not good enough to keep
    await context.setGeolocation({ ...PLACE, accuracy: 9 });                      // the GPS converged
    await expect(page.getByText('موقعیت «ساختمان شماره 1» ثبت شد (دقت حدود ۹ متر)')).toBeVisible({ timeout: 4000 });
    expect((await geoStore(page))[0].accuracy).toBe(9);
  });

  test('if it never gets accurate enough, nothing is saved, the reason is shown and the button works again', async ({ page, baseURL }) => {
    test.setTimeout(45_000);
    await open(page, baseURL!, PHONE, { dayStarted: true });
    await page.locator('.classic-job-row').first().waitFor();
    await startServiceOfFirstBuilding(page);
    await button(page, 'ثبت موقعیت همین‌جا').click();
    const reason = card(page).getByRole('status');
    await expect(reason).toContainText('دقت GPS کافی نیست (حدود ۴۰۰ متر)', { timeout: 20_000 });
    expect(await geoStore(page)).toEqual([]);
    await expect(button(page, 'ثبت موقعیت همین‌جا')).toBeEnabled();
    await expect(card(page)).toBeVisible();
  });
});

test.describe('technician, location permission denied', () => {
  test.use({ geolocation: undefined, permissions: [] });

  test('explains how to allow the location and saves nothing', async ({ page, baseURL }) => {
    await open(page, baseURL!, PHONE, { dayStarted: true });
    await page.locator('.classic-job-row').first().waitFor();
    await startServiceOfFirstBuilding(page);
    await button(page, 'ثبت موقعیت همین‌جا').click();
    await expect(card(page).getByRole('status')).toContainText('اجازهٔ موقعیت مکانی داده نشده است');
    expect(await geoStore(page)).toEqual([]);
    await expect(button(page, 'ثبت موقعیت همین‌جا')).toBeEnabled();
  });
});

/* ---------------------------------------------------------------------------------------------------------------- */
/*                                   office: bulk import in «مرکز اطلاعات ناقص»                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

const DESKTOP = { width: 1280, height: 800 };
async function openIncompleteCenter(page: Page, baseURL: string, seed: Seed = {}) {
  const errors = await open(page, baseURL, DESKTOP, seed);
  await page.getByText('تنظیمات اولیه', { exact: true }).first().click();
  await page.getByText('مرکز اطلاعات ناقص', { exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'موقعیت GPS ساختمان‌ها' })).toBeVisible();
  return errors;
}
const section = (page: Page) => page.getByRole('region', { name: 'موقعیت GPS ساختمان‌ها' });
const coverage = (page: Page) => page.getByTestId('gps-coverage');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'ورود گروهی موقعیت ساختمان‌ها' });
const existingGeo = { index: 1, latitude: 36.2688, longitude: 50.0041, accuracy: 6 };   // T-2 is already registered

/** Windows-1256 bytes of a text, built from the platform's own decoder (old Persian Excel "ANSI" CSV files look like this). */
const cp1256 = (text: string) => {
  const decoder = new TextDecoder('windows-1256');
  const byChar = new Map<string, number>();
  for (let byte = 0; byte < 256; byte++) byChar.set(decoder.decode(new Uint8Array([byte])), byte);
  return Buffer.from([...text].map((char) => { const byte = byChar.get(char); if (byte === undefined) throw new Error(`not in cp1256: ${char}`); return byte; }));
};

test('the center shows the real coverage, exports exactly the buildings without a position, and the export can be filled and imported back', async ({ page, baseURL }) => {
  const errors = await openIncompleteCenter(page, baseURL!, { contracts: 4, geo: [existingGeo] });
  await expect(coverage(page)).toHaveText('۱ از ۴ ساختمان (۲۵٪)');
  await expect(page.getByRole('progressbar', { name: 'پوشش موقعیت GPS' })).toHaveAttribute('aria-valuenow', '25');

  const [download] = await Promise.all([page.waitForEvent('download'), button(page, /فهرست ساختمان‌های بدون موقعیت/).click()]);
  expect(download.suggestedFilename()).toBe('tlift-buildings-without-gps.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);                                          // BOM: Excel shows Persian correctly
  const lines = csv.slice(1).trim().split('\n');
  expect(lines[0]).toBe('"شماره قرارداد","ساختمان","آدرس","عرض جغرافیایی","طول جغرافیایی"');
  expect(lines.slice(1).map((line) => line.split(',')[0])).toEqual(['"T-1"', '"T-3"', '"T-4"']);   // T-2 has a position
  await expect(section(page).getByRole('status')).toContainText('فهرست ۳ ساختمان بدون موقعیت دانلود شد');

  // the office fills two rows and imports the same file back
  const filled = lines.map((line, index) => {
    if (index === 0) return line;
    if (line.startsWith('"T-1"')) return line.replace(/"",""$/, '"36.268801","50.004124"');
    if (line.startsWith('"T-4"')) return line.replace(/"",""$/, '"36.272001","50.012002"');
    return line;
  }).join('\n');
  await button(page, /ورود موقعیت‌ها از فایل یا متن/).click();
  await page.getByLabel('متن CSV موقعیت‌ها').fill(filled);
  await expect(dialog(page).getByLabel('خلاصهٔ پیش‌نمایش')).toContainText('جدید: ۲');
  await expect(dialog(page).getByLabel('خلاصهٔ پیش‌نمایش')).toContainText('خالی: ۱');      // T-3 was left empty: ignored, not an error
  await expect(dialog(page).getByLabel('خلاصهٔ پیش‌نمایش')).not.toContainText('نامعتبر');
  await button(page, 'ثبت ۲ موقعیت').click();
  await expect(coverage(page)).toHaveText('۳ از ۴ ساختمان (۷۵٪)');
  expect(errors).toEqual([]);
});

test('preview first, then save: every row is classified, problems are explained, existing positions are kept unless «replace» is ticked', async ({ page, baseURL }) => {
  const errors = await openIncompleteCenter(page, baseURL!, { contracts: 4, geo: [existingGeo] });
  await button(page, /ورود موقعیت‌ها از فایل یا متن/).click();
  const sample = [
    'شماره قرارداد;ساختمان;عرض جغرافیایی;طول جغرافیایی',
    'T-1;;۳۶٫۲۶۸۸۰۱;۵۰٫۰۰۴۱۲۴',                 // new (Persian digits and decimal separator)
    'T-2;;36,280000;50,020000',                  // already has a position → kept
    'T-3;;50.004124;36.268801',                  // latitude and longitude swapped → invalid
    'T-9;;36.271001;50.011002',                  // no such contract
    ';ساختمان شماره 4;36.272001;50.012002',      // no number: matched by the exact building name
  ].join('\n');
  await page.getByLabel('متن CSV موقعیت‌ها').fill(sample);

  const summary = dialog(page).getByLabel('خلاصهٔ پیش‌نمایش');
  await expect(summary).toContainText('جدید: ۲');
  await expect(summary).toContainText('از قبل ثبت‌شده: ۱');
  await expect(summary).toContainText('نامعتبر: ۱');
  await expect(summary).toContainText('قرارداد پیدا نشد: ۱');
  await expect(dialog(page)).toContainText('عرض و طول جابه‌جا به نظر می‌رسد');
  await expect(dialog(page)).toContainText('قراردادی با این شماره یا نام پیدا نشد');
  await expect(dialog(page)).toContainText('36.268801, 50.004124');                 // Persian digits were understood
  expect(await geoStore(page)).toHaveLength(1);                                       // still nothing written

  await dialog(page).getByLabel(/موقعیت‌های قبلاً ثبت‌شده هم/).check();
  await expect(summary).toContainText('جایگزین می‌شود: ۱');
  await expect(button(page, 'ثبت ۳ موقعیت')).toBeVisible();
  await dialog(page).getByLabel(/موقعیت‌های قبلاً ثبت‌شده هم/).uncheck();
  await expect(button(page, 'ثبت ۲ موقعیت')).toBeVisible();

  await button(page, 'ثبت ۲ موقعیت').click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(section(page).getByRole('status')).toContainText('۲ موقعیت ثبت شد (۲ جدید، ۰ جایگزین)');

  const stored = await geoStore(page);
  expect(stored).toHaveLength(3);
  const byContract = Object.fromEntries(stored.map((item) => [item.contractId, item]));
  expect(byContract[FIRST + 1]).toMatchObject({ latitude: 36.2688, longitude: 50.0041, accuracy: 6, updatedAt: 1 });   // T-2 untouched
  expect(byContract[FIRST]).toMatchObject({ latitude: 36.268801, longitude: 50.004124 });
  expect(byContract[FIRST + 3]).toMatchObject({ latitude: 36.272001, longitude: 50.012002 });
  expect(byContract[FIRST]).not.toHaveProperty('accuracy');                           // no invented GPS accuracy for typed-in coordinates
  expect(byContract[FIRST + 2]).toBeUndefined();                                      // the invalid row (T-3) was not saved
  await expect(coverage(page)).toHaveText('۳ از ۴ ساختمان (۷۵٪)');

  // one history entry for the whole import, without a "before" (the history page would offer a contract rollback for it)
  const audit = await page.evaluate(() => JSON.parse(localStorage.getItem('tlift_audit_log_v1') || '[]') as Array<Record<string, unknown>>);
  const entry = audit.find((item) => item.action === 'ورود گروهی موقعیت ساختمان‌ها');
  expect(entry).toBeTruthy();
  expect(entry).not.toHaveProperty('before');
  expect(errors).toEqual([]);
});

test('replace: an existing position is overwritten only when asked, and the old one is kept in the history entry', async ({ page, baseURL }) => {
  await openIncompleteCenter(page, baseURL!, { contracts: 3, geo: [existingGeo] });
  await button(page, /ورود موقعیت‌ها از فایل یا متن/).click();
  await page.getByLabel('متن CSV موقعیت‌ها').fill('T-2,36.280000,50.020000');
  await expect(button(page, 'موردی برای ثبت نیست')).toBeDisabled();                   // default: kept → nothing to save
  await dialog(page).getByLabel(/موقعیت‌های قبلاً ثبت‌شده هم/).check();
  await button(page, 'ثبت ۱ موقعیت').click();
  await expect(section(page).getByRole('status')).toContainText('۱ موقعیت ثبت شد (۰ جدید، ۱ جایگزین)');
  expect(await geoStore(page)).toMatchObject([{ contractId: FIRST + 1, latitude: 36.28, longitude: 50.02 }]);
  const audit = await page.evaluate(() => JSON.parse(localStorage.getItem('tlift_audit_log_v1') || '[]') as Array<{ action: string; after?: { replacedPrevious?: Array<Record<string, number>> } }>);
  const entry = audit.find((item) => item.action === 'ورود گروهی موقعیت ساختمان‌ها');
  expect(entry?.after?.replacedPrevious?.[0]).toMatchObject({ contractId: FIRST + 1, latitude: 36.2688, longitude: 50.0041 });
});

test('a file can be chosen instead of pasting; an old Windows-1256 file (Arabic yeh in the headers) is read correctly; bad structure is reported', async ({ page, baseURL }) => {
  await openIncompleteCenter(page, baseURL!, { contracts: 3 });
  await button(page, /ورود موقعیت‌ها از فایل یا متن/).click();

  // header and building column written the way an old "ANSI" Persian Excel file stores them (ي instead of ی)
  const oldFile = cp1256('شماره قرارداد;ساختمان;عرض جغرافيايي;طول جغرافيايي\r\nT-1;ساختمان شماره 1;36,268801;50,004124\r\nT-3;ساختمان شماره 3;36,272001;50,012002\r\n');
  await page.getByLabel('انتخاب فایل CSV موقعیت‌ها').setInputFiles({ name: 'positions.csv', mimeType: 'text/csv', buffer: oldFile });
  await expect(dialog(page).getByLabel('خلاصهٔ پیش‌نمایش')).toContainText('جدید: ۲');
  await expect(dialog(page)).toContainText('positions.csv');
  await expect(button(page, 'ثبت ۲ موقعیت')).toBeEnabled();

  await page.getByLabel('متن CSV موقعیت‌ها').fill('شماره قرارداد,ساختمان\nT-1,ساختمان شماره 1');
  await expect(dialog(page).getByRole('alert')).toContainText('ستون عرض و طول جغرافیایی');
  await expect(button(page, 'موردی برای ثبت نیست')).toBeDisabled();
  await page.getByLabel('متن CSV موقعیت‌ها').fill('');
  await button(page, 'انصراف').click();
  await expect(dialog(page)).toHaveCount(0);
  expect(await geoStore(page)).toEqual([]);
});

test('with «حضور در محل» required, the import warns that inexact coordinates can block a technician from starting a service', async ({ page, baseURL }) => {
  await openIncompleteCenter(page, baseURL!, { contracts: 2, gpsRequired: true });
  await button(page, /ورود موقعیت‌ها از فایل یا متن/).click();
  const note = dialog(page).getByRole('note');
  await expect(note).toContainText('الزام «حضور در محل برای شروع سرویس» فعال است (شعاع ۳۰۰ متر)');
  await expect(note).toContainText('مختصات نادقیق');
});

test('without that requirement the warning is not shown', async ({ page, baseURL }) => {
  await openIncompleteCenter(page, baseURL!, { contracts: 2, gpsRequired: false });
  await button(page, /ورود موقعیت‌ها از فایل یا متن/).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('note')).toHaveCount(0);
});

import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// The mobile map («نقشه») must show the buildings NEAR the technician, not every contract:
//   - opening it locates the user by itself and shows only the nearest few (DOM stays small with 1200 contracts);
//   - only real registered GPS is drawn; a building without GPS is never pinned or navigated to;
//   - radius / "show more" / the other filters / search stay available and bounded;
//   - the once-per-second tick of the app does not repaint the map.
// Synthetic data only; the network is cut off except for the local preview (OSM tiles are answered locally).

const HOME = { latitude: 36.27, longitude: 50.0 };
const CONTRACTS = 1200;
const FIRST_ID = 700001;
const NEAR = 30;          // 100 m … ~1.4 km from HOME
const MID = 20;           // 6 … 8 km
const FAR = 10;           // 25 … 35 km
const NO_GPS_INDEX = 60;  // «برج بی‌موقعیت»
const FAR_INDEX = 55;     // «برج دور» (registered, 30 km away)

type Seed = { contracts?: number; normalised?: boolean };

async function open(page: Page, baseURL: string, seed: Seed = {}) {
  const errors: string[] = [];
  const tileRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.host === 'tile.openstreetmap.org') {
      tileRequests.push(url.pathname);
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' });
    }
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });
  await page.addInitScript((s: Required<Seed> & { home: { latitude: number; longitude: number }; first: number; near: number; mid: number; far: number; noGps: number; farIndex: number }) => {
    if (window.top !== window.self) return;
    if (sessionStorage.getItem('map_seeded')) return; // seed once per tab so reloads keep the saved state
    sessionStorage.setItem('map_seeded', '1');
    localStorage.setItem('tlift_manual_offline_v1', 'true');
    localStorage.setItem('tlift_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_customer_session', JSON.stringify({ id: 'test', name: 'همکار آزمایشی', role: 'admin', phone: '09000000000' }));

    // the same "previous Persian month" the app looks at (only the month name/year matter for the pending flag)
    const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
    const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: 'numeric' }).formatToParts(new Date());
    const year = Number(parts.find((p) => p.type === 'year')!.value);
    const month = Number(parts.find((p) => p.type === 'month')!.value);
    const prev = month === 1 ? { y: year - 1 } : { y: year };

    const ids = Array.from({ length: s.contracts }, (_, index) => s.first + index);
    const names = (index: number) => (index === s.noGps ? 'برج بی‌موقعیت' : index === s.farIndex ? 'برج دور' : `ساختمان آزمایشی ${index + 1}`);
    localStorage.setItem('tlift_contracts', JSON.stringify(ids.map((id, index) => ({
      id, no: `M-${index + 1}`, building: names(index), manager: 'مدیر آزمایشی', address: `آدرس آزمایشی ${index + 1}`,
      zone: 'آزمایشی', monthlyServiceFee: 1000000, kind: 'general', start: '1404/01/01', end: '1406/12/29',
    }))));
    // two thirds of the buildings still owe last month's service. `normalised` = the planned dates are already what the store computes
    // (contract numbers outside the official tables → day 26), i.e. data of a phone that has already run the app once.
    localStorage.setItem('tlift_contract_details', JSON.stringify(Object.fromEntries(ids.map((id, index) => [id, {
      months: monthNames.map((name, k) => ({
        id: k + 1, m: name, y: prev.y, done: index % 3 === 0, paid: false, amount: 1000000,
        ...(s.normalised ? { plannedDate: `${prev.y}/${String(k + 1).padStart(2, '0')}/26` } : {}),
      })),
      payments: [], invoices: [], breakdowns: [],
    }]))));

    // registered GPS: NEAR buildings on a spiral within 1.4 km, MID at 6–8 km, FAR at 25–35 km of HOME
    const metersNorth = (m: number) => m / 111194.93;
    const metersEast = (m: number) => m / (111194.93 * Math.cos((s.home.latitude * Math.PI) / 180));
    const at = (index: number, meters: number) => {
      const angle = index * 2.399963; // golden angle: spreads the pins around
      return { latitude: s.home.latitude + metersNorth(meters * Math.cos(angle)), longitude: s.home.longitude + metersEast(meters * Math.sin(angle)) };
    };
    const geo: Array<{ contractId: number; latitude: number; longitude: number; accuracy: number; updatedAt: number }> = [];
    for (let i = 0; i < s.near; i++) geo.push({ contractId: ids[i], ...at(i, 100 + i * 45), accuracy: 5, updatedAt: Date.now() });
    for (let i = 0; i < s.mid; i++) geo.push({ contractId: ids[s.near + i], ...at(i, 6000 + i * 100), accuracy: 5, updatedAt: Date.now() });
    for (let i = 0; i < s.far; i++) geo.push({ contractId: ids[s.near + s.mid + i], ...at(i, 25000 + i * 1000), accuracy: 5, updatedAt: Date.now() });
    localStorage.setItem('tlift_contract_geo_locations_v1', JSON.stringify(geo));
  }, { contracts: seed.contracts ?? CONTRACTS, normalised: seed.normalised ?? true, home: HOME, first: FIRST_ID, near: NEAR, mid: MID, far: FAR, noGps: NO_GPS_INDEX, farIndex: FAR_INDEX });
  await page.goto('/');
  await page.locator('.classic-job-row').first().waitFor();
  return { errors, tileRequests };
}

type GeoCall = { enableHighAccuracy?: boolean; timeout?: number; maximumAge?: number };
/** Records every getCurrentPosition call of the page; optionally makes the approximate (low-accuracy) attempt time out. */
async function recordGeolocation(page: Page, options: { failApproximate?: boolean } = {}) {
  await page.addInitScript((opts: { failApproximate?: boolean }) => {
    const calls: GeoCall[] = [];
    (window as unknown as { __geoCalls: GeoCall[] }).__geoCalls = calls;
    const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (success, failure, positionOptions) => {
      calls.push({ ...(positionOptions || {}) });
      if (opts.failApproximate && positionOptions && positionOptions.enableHighAccuracy === false) {
        setTimeout(() => failure?.({ code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }), 20);
        return;
      }
      original(success, failure, positionOptions);
    };
  }, options);
}
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: GeoCall[] }).__geoCalls);

const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });
const pins = (page: Page) => page.locator('[data-map-pin]');
const rows = (page: Page) => page.locator('[data-map-row]');
const pinIds = async (page: Page) => (await pins(page).evaluateAll((list) => list.map((el) => Number(el.getAttribute('data-map-pin')))));
const rowIds = async (page: Page) => (await rows(page).evaluateAll((list) => list.map((el) => Number(el.getAttribute('data-map-row')))));
const openMap = async (page: Page) => { await button(page, 'نقشه').click(); };
const located = (page: Page) => expect(page.getByText(/موقعیت شما دریافت شد/)).toBeVisible();
const idOf = (index: number) => FIRST_ID + index;

test.describe('with location permission', () => {
  test.use({ geolocation: HOME, permissions: ['geolocation'] });

  test('opening the map locates the technician and shows only the nearest buildings – not all 1200 – in a small page', async ({ page, baseURL }) => {
    const { errors, tileRequests } = await open(page, baseURL!);
    await openMap(page);                                    // no tap on «موقعیت من»: it locates by itself
    await located(page);

    // default = «نزدیک من»: 30 buildings have GPS within 2.5 km; only the nearest 12 are drawn and listed
    await expect(button(page, /نزدیک من/)).toContainText('۳۰');
    await expect(page.getByText('۱۲ از ۳۰ ساختمان')).toBeVisible();
    const nearest = Array.from({ length: 12 }, (_, i) => idOf(i));                 // distances 100 m, 145 m, 190 m, … (strictly increasing)
    expect(await pinIds(page)).toEqual(expect.arrayContaining(nearest));
    expect((await pinIds(page)).length).toBe(12);
    expect(await rowIds(page)).toEqual(nearest);                                   // nearest first
    await expect(rows(page).first()).toContainText('متر');

    // every pin is a real registered building: nothing from the far ring, nothing without GPS
    const drawn = new Set(await pinIds(page));
    for (const index of [NEAR, NEAR + MID, FAR_INDEX, NO_GPS_INDEX, 100, 1000]) expect(drawn.has(idOf(index))).toBe(false);

    // the screen is small and has no embedded web page: the old map had one DOM pin per contract and a full-page iframe
    expect(await page.locator('iframe').count()).toBe(0);
    const nodes = await page.evaluate(() => document.querySelectorAll('*').length);
    expect(nodes, `DOM nodes on the map screen with ${CONTRACTS} contracts`).toBeLessThan(800);
    const blurred = await page.evaluate(() => Array.from(document.querySelectorAll('[data-map-canvas] *, [data-map-list] *')).filter((el) => {
      const style = getComputedStyle(el);
      return style.backdropFilter !== 'none' && style.backdropFilter !== '';
    }).length);
    expect(blurred).toBe(0);

    // the OpenStreetMap base is a handful of tiles placed under the pins, and the layers button can hide/show it
    const tiles = page.locator('[data-map-canvas] img');
    expect(await tiles.count()).toBeGreaterThan(0);
    expect(await tiles.count()).toBeLessThanOrEqual(16);
    expect(tileRequests.length).toBeLessThanOrEqual(16);
    await page.getByTitle('تغییر حالت نقشه شهری / معابر').click();
    await expect(tiles).toHaveCount(0);
    await page.getByTitle('تغییر حالت نقشه شهری / معابر').click();
    expect(await tiles.count()).toBeGreaterThan(0);

    // distance rings and the user's own dot are drawn
    await expect(page.locator('[data-map-ring="outer"]')).toBeVisible();
    await expect(page.locator('[data-map-user]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('radius, «نمایش بیشتر» and the other filters stay available – and every one of them is bounded', async ({ page, baseURL }) => {
    await open(page, baseURL!);
    await openMap(page);
    await located(page);

    // wider radius reaches the ring at 6–8 km (30 + 20 buildings), still only 12 drawn until «نمایش بیشتر»
    await page.getByRole('group', { name: 'شعاع نزدیکی' }).getByRole('button', { name: '۱۰ کم' }).click();
    await expect(button(page, /نزدیک من/)).toContainText('۵۰');
    await expect(page.getByText('۱۲ از ۵۰ ساختمان')).toBeVisible();
    expect((await pinIds(page)).length).toBe(12);
    await button(page, /نمایش بیشتر/).click();
    await expect(page.getByText('۲۴ از ۵۰ ساختمان')).toBeVisible();
    expect((await pinIds(page)).length).toBe(24);
    expect((await rowIds(page)).length).toBe(24);
    // smaller radius again: 100 + 45·i metres ≤ 1 km → about 21 of the 30 buildings (the exact count at the 1000 m edge is not asserted)
    await page.getByRole('group', { name: 'شعاع نزدیکی' }).getByRole('button', { name: '۱ کم' }).click();
    const chipText = await button(page, /نزدیک من/).innerText();
    const count = Number([...(chipText.match(/\(([۰-۹]+)\)/)?.[1] || '')].map((digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)).join(''));
    expect(count).toBeGreaterThanOrEqual(20);
    expect(count).toBeLessThanOrEqual(21);
    const within1km = await rowIds(page);
    expect(within1km.length).toBe(12);
    expect(within1km.every((id) => id - FIRST_ID < NEAR)).toBe(true);

    // the old filters are still there: all, registered GPS, pending last month – each capped at the page size
    await button(page, /همه ساختمان‌ها/).click();
    await expect(page.getByText('۱۲ از ۱٬۲۰۰ ساختمان')).toBeVisible();
    expect((await rowIds(page)).length).toBe(12);
    expect((await pinIds(page)).length).toBeLessThanOrEqual(12);
    await button(page, /GPS ثبت‌شده/).click();
    await expect(page.getByText('۱۲ از ۶۰ ساختمان')).toBeVisible();
    await button(page, /انجام‌نشده ماه گذشته/).click();
    await expect(page.getByText('۱۲ از ۸۰۰ ساختمان')).toBeVisible();        // two thirds of 1200 are pending
    expect((await rowIds(page)).length).toBe(12);
    const nodes = await page.evaluate(() => document.querySelectorAll('*').length);
    expect(nodes).toBeLessThan(800);

    // coverage is stated honestly
    await expect(page.locator('[data-map-coverage]')).toContainText('۶۰ از ۱٬۲۰۰ ساختمان');

    // back to «نزدیک من»
    await button(page, /نزدیک من/).click();
    await expect(page.getByRole('group', { name: 'شعاع نزدیکی' })).toBeVisible();
  });

  test('search reaches any building; one without GPS is neither pinned nor navigable but can get «ثبت GPS»; a registered one navigates to its real coordinates', async ({ page, baseURL }) => {
    await open(page, baseURL!);
    await openMap(page);
    await located(page);

    // building without GPS: found by search (the radius does not hide it)…
    await page.getByPlaceholder(/جستجوی ساختمان/).fill('برج بی‌موقعیت');
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByText('جستجو در همهٔ ساختمان‌ها')).toBeVisible();
    expect(await pinIds(page)).toEqual([]);                                        // …but never drawn
    const sheet = page.locator('[data-map-sheet]');
    await expect(sheet).toContainText('موقعیت ثبت نشده');
    await expect(sheet).not.toContainText('موقعیت تقریبی');
    await expect(sheet.getByRole('button', { name: 'ثبت GPS' })).toBeEnabled();
    await expect(sheet.getByRole('button', { name: 'مسیریابی' })).toHaveAttribute('aria-disabled', 'true');
    await sheet.getByRole('button', { name: 'مسیریابی' }).click({ force: true });   // still tappable: it explains why instead of navigating
    await expect(page.getByText(/برای مسیریابی دقیق اول «ثبت GPS» را بزنید/)).toBeVisible();
    await expect(page.getByText('انتخاب نرم‌افزار مسیریاب')).toHaveCount(0);      // no navigation to an invented point

    // a far registered building (30 km) is found by search and gets a pin + real distance
    await page.getByPlaceholder(/جستجوی ساختمان/).fill('برج دور');
    await expect(rows(page)).toHaveCount(1);
    await expect(pins(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('کیلومتر');

    // a near registered building navigates to exactly the stored coordinates
    await page.getByPlaceholder(/جستجوی ساختمان/).fill('');
    await rows(page).first().click();
    await page.locator('[data-map-sheet]').getByRole('button', { name: 'مسیریابی' }).click();
    await expect(page.getByText('انتخاب نرم‌افزار مسیریاب')).toBeVisible();
    const stored = await page.evaluate((id) => (JSON.parse(localStorage.getItem('tlift_contract_geo_locations_v1') || '[]') as Array<{ contractId: number; latitude: number; longitude: number }>).find((item) => item.contractId === id), idOf(0));
    const links = await page.locator('a[href*="google.com/maps/dir"]').evaluateAll((list) => list.map((el) => el.getAttribute('href')));
    expect(links.join(' ')).toContain(`destination=${stored!.latitude},${stored!.longitude}`);
  });

  test('auto-locate asks for a fast approximate fix first and falls back to a precise one; the manual button asks for precision right away', async ({ page, baseURL }) => {
    await recordGeolocation(page, { failApproximate: true });
    await open(page, baseURL!);
    await openMap(page);
    await located(page);                                    // the approximate attempt timed out → the precise one answered
    const auto = await geoCalls(page);
    expect(auto.map((call) => call.enableHighAccuracy)).toEqual([false, true]);
    expect(auto[0].maximumAge).toBeGreaterThanOrEqual(60000);   // a recent cached position is fine for «nearby»
    await button(page, /GPS فعال/).first().click();         // manual: «give me the exact position»
    await expect.poll(async () => (await geoCalls(page)).length).toBe(3);
    expect((await geoCalls(page))[2].enableHighAccuracy).toBe(true);
  });

  test('starting a service from the map still obeys the workday rule (the map is not a way around «شروع کار»)', async ({ page, baseURL }) => {
    await open(page, baseURL!);
    await openMap(page);
    await located(page);
    await page.locator('[data-map-sheet]').getByRole('button', { name: /شروع سرویس/ }).click();
    await expect(page.getByRole('alertdialog', { name: 'ابتدا «شروع کار» را بزنید' })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tlift_active_service_assignments_v1') || '[]'))).toEqual([]);
  });

  test('the once-per-second tick of the app does not repaint the map', async ({ page, baseURL }) => {
    await open(page, baseURL!);
    await openMap(page);
    await located(page);
    await page.waitForTimeout(800); // let the first frames settle
    const mutations = await page.evaluate(() => new Promise<number>((resolve) => {
      let count = 0;
      const canvas = document.querySelector('[data-map-canvas]')!;
      const observer = new MutationObserver((records) => { count += records.length; });
      observer.observe(canvas, { subtree: true, childList: true, attributes: true, characterData: true });
      setTimeout(() => { observer.disconnect(); resolve(count); }, 6200); // covers one rebuild of the 5-second job list too
    }));
    expect(mutations, 'DOM mutations inside the map canvas while nothing is touched').toBe(0);
  });
});

test.describe('without location permission', () => {
  test.use({ geolocation: undefined, permissions: [] });

  test('says so honestly, shows nothing invented, and recovers as soon as the location is allowed', async ({ page, baseURL, context }) => {
    await recordGeolocation(page);
    await open(page, baseURL!);
    await openMap(page);
    await expect(page.getByText(/دسترسی موقعیت مکانی بسته است/)).toBeVisible();
    expect((await geoCalls(page)).length, 'a refusal is final: no second, precise attempt').toBe(1);
    expect(await pinIds(page)).toEqual([]);
    expect(await rowIds(page)).toEqual([]);
    await expect(page.locator('[data-map-empty]')).toContainText('موقعیت شما لازم است');
    await expect(page.locator('[data-map-user]')).toHaveCount(0);
    // the other ways to find a building are still there
    await button(page, /همه ساختمان‌ها/).click();
    expect((await rowIds(page)).length).toBe(12);

    await grant(context);
    await button(page, /نزدیک من/).click();
    await page.locator('[data-map-empty] button', { hasText: 'دریافت موقعیت من' }).click();
    await located(page);
    expect((await pinIds(page)).length).toBe(12);
  });
});

async function grant(context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(HOME);
}

test('first launch with data that still needs normalising writes it once – not once per contract (the old code froze/crashed here)', async ({ page, baseURL }) => {
  await page.addInitScript(() => {
    (window as unknown as { __writes: number }).__writes = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'tlift_contract_details') (window as unknown as { __writes: number }).__writes++;
      return original.call(this, key, value);
    };
  });
  await open(page, baseURL!, { contracts: 300, normalised: false });
  await page.waitForTimeout(1200);
  const writes = await page.evaluate(() => (window as unknown as { __writes: number }).__writes);
  expect(writes, 'writes of the whole contract-details store during the first launch').toBeLessThanOrEqual(3);
  // …and the result is still complete: every contract got its planned dates
  const missing = await page.evaluate(() => {
    const details = JSON.parse(localStorage.getItem('tlift_contract_details') || '{}') as Record<string, { months: Array<{ plannedDate?: string }> }>;
    return Object.values(details).filter((item) => item.months.some((month) => !/^\d{4}\/\d{2}\/\d{2}$/.test(month.plannedDate || ''))).length;
  });
  expect(missing).toBe(0);
});

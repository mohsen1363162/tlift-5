import { test, expect, type Page } from '@playwright/test';

// The technician app used to re-render ITSELF once per second (a clock state in its root) and rebuild its whole service list
// every five seconds. With hundreds of contracts that is what kept a phone busy and warm while nothing was happening.
// Now only the live timers update themselves; the list is rebuilt when the contract data really changes.
// Synthetic data only; the network is cut off except for the local preview.

const TECH = 'همکار آزمایشی';
const FIRST_ID = 880001;
const HOUR = 3_600_000;

type Assignment = { contractId: number; monthId: number; technicianName: string; startedAt: number; buildingName: string };
type Seed = {
  contracts?: number;
  dayStartedAgoMs?: number;
  assignments?: Array<{ index: number; agoMs: number }>;
  manualOffline?: boolean;
  countRenders?: boolean;
  /** one planned date («YYYY/MM/26», the day the store itself plans for unlisted numbers) per contract */
  plannedDates?: string[];
};

async function open(page: Page, baseURL: string, seed: Seed = {}) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });

  if (seed.countRenders) {
    // A minimal stand-in for the React DevTools hook: React reports every commit to it (production builds too). We look for
    // the root component of the technician app (recognised by its three props) and count the commits in which IT re-rendered.
    await page.addInitScript(() => {
      const w = window as unknown as { __commits: number; __rootRenders: number; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown };
      w.__commits = 0;
      w.__rootRenders = 0;
      type Fiber = { type?: unknown; memoizedProps?: Record<string, unknown> | null; flags: number; child: Fiber | null; sibling: Fiber | null };
      const isAppRoot = (fiber: Fiber) => typeof fiber.type === 'function' && !!fiber.memoizedProps
        && 'technician' in fiber.memoizedProps && 'onSignOut' in fiber.memoizedProps && 'onExitToDesktop' in fiber.memoizedProps;
      const find = (start: Fiber | null): Fiber | null => {
        const stack: Fiber[] = start ? [start] : [];
        while (stack.length) {
          const fiber = stack.pop()!;
          if (isAppRoot(fiber)) return fiber;
          if (fiber.sibling) stack.push(fiber.sibling);
          if (fiber.child) stack.push(fiber.child);
        }
        return null;
      };
      w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true,
        isDisabled: false,
        renderers: new Map(),
        inject(renderer: unknown) { (this as { renderers: Map<number, unknown> }).renderers.set(1, renderer); return 1; },
        onCommitFiberRoot(_id: number, root: { current: Fiber }) {
          w.__commits++;
          const app = find(root.current);
          if (app && (app.flags & 1) === 1) w.__rootRenders++; // 1 = PerformedWork: this component function really ran
        },
        onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {}, checkDCE() {},
      };
    });
  }

  await page.addInitScript((s: Seed & { first: number }) => {
    if (window.top !== window.self) return;
    if (sessionStorage.getItem('idle_seeded')) return; // seed once per tab so reloads keep the saved state
    sessionStorage.setItem('idle_seeded', '1');
    if (s.manualOffline !== false) localStorage.setItem('tlift_manual_offline_v1', 'true');
    localStorage.setItem('tlift_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_customer_session', JSON.stringify({ id: 'test', name: 'همکار آزمایشی', role: 'admin', phone: '09000000000' }));
    const ids = Array.from({ length: s.contracts || 2 }, (_, index) => s.first + index);
    localStorage.setItem('tlift_contracts', JSON.stringify(ids.map((id, index) => ({
      id, no: `TEST-${index + 1}`, building: `ساختمان شماره ${index + 1}`, manager: 'مدیر آزمایشی', address: 'آدرس آزمایشی بدون داده واقعی',
      zone: 'آزمایشی', monthlyServiceFee: 1000000, kind: 'general', start: '1404/01/01', end: '1405/12/29',
    }))));
    // planned dates the store would compute itself for numbers outside the official tables (day 26) → nothing to normalise at start
    const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
    localStorage.setItem('tlift_contract_details', JSON.stringify(Object.fromEntries(ids.map((id, index) => {
      const planned = s.plannedDates?.[index] || '1404/01/26';
      const [year, month] = planned.split('/').map(Number);
      return [id, {
        months: [{ id: 1, m: monthNames[month - 1], y: year, done: false, paid: false, amount: 1000000, plannedDate: planned, deviceNo: 'A' }],
        payments: [], invoices: [], breakdowns: [],
      }];
    }))));
    if (s.dayStartedAgoMs !== undefined) localStorage.setItem('tlift_mobile_day_start', String(Date.now() - s.dayStartedAgoMs));
    if (s.assignments) {
      localStorage.setItem('tlift_active_service_assignments_v1', JSON.stringify(s.assignments.map((item) => ({
        contractId: s.first + item.index, monthId: 1, technicianName: 'همکار آزمایشی', startedAt: Date.now() - item.agoMs, buildingName: `ساختمان شماره ${item.index + 1}`,
      }))));
    }
  }, { ...seed, first: FIRST_ID });
  await page.goto('/');
  await page.locator('.classic-job-row').first().waitFor();
  return errors;
}

const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });
const headerClock = (page: Page) => page.locator('.classic-clock span[dir="ltr"]');
/** «۰۰:۰۱:۰۵» → 65 */
const seconds = (text: string | null) => {
  const latin = (text || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const match = latin.match(/(\d+):(\d+):(\d+)/);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : NaN;
};
const renders = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __commits: number; __rootRenders: number };
  return { commits: w.__commits, root: w.__rootRenders };
});

test('while nothing is touched the app root stays still; only the live timers update themselves', async ({ page, baseURL }) => {
  const errors = await open(page, baseURL!, { contracts: 400, dayStartedAgoMs: 65_000, countRenders: true });
  await expect(headerClock(page)).not.toHaveText('شروع کار');
  await page.waitForTimeout(1500); // first render, first store notifications and the lazy chunks settle

  const before = await renders(page);
  const clockBefore = seconds(await headerClock(page).textContent());
  await page.waitForTimeout(4300);
  const after = await renders(page);
  const clockAfter = seconds(await headerClock(page).textContent());

  // the probe itself works: the day timer is a live component, so React commits about once per second
  expect(after.commits - before.commits, 'React commits in 4.3 s (the live day timer)').toBeGreaterThanOrEqual(3);
  // …but none of them re-ran the root component (the old code re-ran it on every one of them and rebuilt the list every 5th)
  expect(after.root - before.root, 'root component renders in 4.3 s of idle time').toBeLessThanOrEqual(1);
  // and the timer really is counting
  expect(clockAfter - clockBefore).toBeGreaterThanOrEqual(4);
  expect(clockAfter - clockBefore).toBeLessThanOrEqual(6);
  expect(errors).toEqual([]);
});

test('live timers keep counting: day timer in the header, running service on the home card and on the work screen, drawer totals', async ({ page, baseURL }) => {
  await open(page, baseURL!, { dayStartedAgoMs: 65_000, assignments: [{ index: 0, agoMs: 125_000 }] });
  const dayAtLoad = seconds(await headerClock(page).textContent());
  expect(dayAtLoad).toBeGreaterThanOrEqual(65);
  expect(dayAtLoad).toBeLessThanOrEqual(75);

  const card = page.locator('.classic-active-work .font-mono');
  await expect(card).toBeVisible();
  const cardAtLoad = seconds(await card.textContent());
  expect(cardAtLoad).toBeGreaterThanOrEqual(125);
  expect(cardAtLoad).toBeLessThanOrEqual(135);

  await page.waitForTimeout(2300);
  expect(seconds(await headerClock(page).textContent()) - dayAtLoad).toBeGreaterThanOrEqual(2);
  expect(seconds(await card.textContent()) - cardAtLoad).toBeGreaterThanOrEqual(2);

  // the work screen shows the same running time, also live
  await page.locator('.classic-active-work').getByRole('button', { name: /در حال انجام/ }).click();
  const bar = page.locator('div.bg-blue-600 span.font-mono');
  await expect(bar).toBeVisible();
  const barNow = seconds(await bar.textContent());
  expect(barNow).toBeGreaterThanOrEqual(127);
  await page.waitForTimeout(2100);
  expect(seconds(await bar.textContent()) - barNow).toBeGreaterThanOrEqual(2);

  // the drawer's «ساعت کار امروز» is live too (a reload returns to the home page; the workday and the service are stored)
  await page.reload();
  await page.locator('.classic-job-row').first().waitFor();
  await button(page, 'منوی اصلی').click();
  const tile = (title: string | RegExp) => page.locator('div.rounded-lg.bg-gray-50.p-2.text-center', { hasText: title });
  const today = tile('ساعت کار امروز').locator('div.font-bold');
  await expect(today).toBeVisible();
  const drawerNow = seconds(await today.textContent());
  expect(drawerNow).toBeGreaterThanOrEqual(65);
  await page.waitForTimeout(2100);
  expect(seconds(await today.textContent()) - drawerNow).toBeGreaterThanOrEqual(2);
  await expect(tile(/ساعت کار (?!امروز)/)).toBeVisible();              // the month total is listed as well
});

test('finishing a service updates the home lists at once – the list is rebuilt because the data changed, not because a timer came round', async ({ page, baseURL }) => {
  const errors = await open(page, baseURL!, { contracts: 2, dayStartedAgoMs: 60_000 });
  const past = page.getByText(/کارهای تاریخ گذشته \(/);
  await expect(past).toContainText('۲');

  await page.locator('.classic-job-row', { hasText: 'ساختمان شماره 1' }).first().click();
  await button(page, 'شروع سرویس').click();
  await expect(page.locator('.classic-page-title')).toHaveText('انجام سرویس');
  await button(page, /مرحله بعد/).click();                       // checklist → report
  await button(page, /مرحله بعد/).click();                       // report → sign
  await page.getByLabel('عدم حضور مدیر').check();
  await button(page, /ثبت.*و اتمام سرویس/).click();
  await button(page, 'بدون دریافت وجه').click();

  // the record is stored…
  await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem('tlift_contract_details') || '{}')[id]?.months?.[0]?.done, FIRST_ID)).toBe(true);
  // …and the home page shows it right away (the old list waited for its five-second rebuild)
  await expect(past).toContainText('۱', { timeout: 1200 });
  await expect(page.locator('.classic-job-row', { hasText: 'ساختمان شماره 1' })).toHaveCount(0);
  await expect(page.locator('.classic-job-row', { hasText: 'ساختمان شماره 2' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the offline banner follows the browser\'s online/offline events immediately', async ({ page, baseURL, context }) => {
  await open(page, baseURL!, { manualOffline: false });
  const banner = page.locator('.classic-sync-notice');
  await expect(banner).toHaveCount(0);
  await context.setOffline(true);
  await expect(banner).toBeVisible({ timeout: 700 });
  await expect(banner).toContainText('اینترنت دستگاه قطع است');
  await context.setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 700 });
});

test.describe('with a controllable clock', () => {
  test.use({ timezoneId: 'Asia/Tehran' });
  test('the 12-hour limit ends a forgotten workday at the moment it is reached and adds exactly 12 hours to the month', async ({ page, baseURL }) => {
    await page.clock.install({ time: Date.now() });
    const errors = await open(page, baseURL!, { dayStartedAgoMs: 12 * HOUR - 30_000 });
    await expect(headerClock(page)).not.toHaveText('شروع کار');
    await page.clock.fastForward(20_000);                        // 10 s left: still running
    await expect(headerClock(page)).not.toHaveText('شروع کار');
    await page.clock.fastForward(11_000);                        // past the limit
    await expect(headerClock(page)).toHaveText('شروع کار');
    await expect(page.getByText('نوبت کاری پس از رسیدن به سقف ۱۲ ساعت به‌صورت خودکار پایان یافت.')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('tlift_mobile_day_start'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('tlift_monthly_work_time_v3'))).toBe(String(12 * 3600));
    expect(errors).toEqual([]);
  });

  test('a workday left open for longer than 12 hours while the app was closed ends as soon as the app opens', async ({ page, baseURL }) => {
    await open(page, baseURL!, { dayStartedAgoMs: 13 * HOUR });
    await expect(headerClock(page)).toHaveText('شروع کار');
    await expect(page.getByText('نوبت کاری پس از رسیدن به سقف ۱۲ ساعت به‌صورت خودکار پایان یافت.')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('tlift_monthly_work_time_v3'))).toBe(String(12 * 3600));
  });

  test('the "today" and "past" lists move over by themselves when the day changes at midnight', async ({ page, baseURL }) => {
    // 18 Oct 2026, 23:59:40 in Tehran = 1405/07/26. The store plans every unlisted contract on the 26th of the month:
    // the first job is today's, the second belongs to next month. Ten seconds after midnight the first one is overdue.
    await page.clock.install({ time: new Date('2026-10-18T23:59:40+03:30') });
    await open(page, baseURL!, { contracts: 2, plannedDates: ['1405/07/26', '1405/08/26'] });
    const today = page.getByText(/کارهای امروز \(/);
    const past = page.getByText(/کارهای تاریخ گذشته \(/);
    const dateOf = (building: string) => page.locator('.classic-job-row', { hasText: building }).locator('.classic-job-date');
    await expect(today).toContainText('۱');
    await expect(past).toContainText('۰');
    await expect(dateOf('ساختمان شماره 1')).toHaveText('امروز');

    await page.clock.fastForward(30_000);                        // 00:00:10 on the 27th
    await expect(today).toContainText('۰');
    await expect(past).toContainText('۱');
    await expect(dateOf('ساختمان شماره 1')).not.toHaveText('امروز');
    await expect(dateOf('ساختمان شماره 1')).toHaveClass(/is-overdue/);
  });

  test('coming back to the app (after sleep) shows the right time at once, without waiting for the next second', async ({ page, baseURL }) => {
    await page.clock.install({ time: Date.now() });
    await open(page, baseURL!, { dayStartedAgoMs: 65_000 });
    await page.clock.pauseAt(new Date(Date.now() + 1000));       // time stands still: no timer can fire from here on
    const frozen = seconds(await headerClock(page).textContent());
    const pageNow = await page.evaluate(() => Date.now());
    await page.clock.setSystemTime(new Date(pageNow + 10 * 60_000)); // the phone "slept" for ten minutes (no timer fired)
    await page.waitForTimeout(150);
    expect(seconds(await headerClock(page).textContent()), 'nothing has refreshed the timer yet').toBe(frozen);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(async () => seconds(await headerClock(page).textContent()) - frozen).toBeGreaterThanOrEqual(595);
  });
});

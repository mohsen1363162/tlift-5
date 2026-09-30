import { test, expect, type Page } from '@playwright/test';

// Installing T_lift as a REAL app (not a browser shortcut with a Chrome badge):
//   - Chrome's install offer («beforeinstallprompt») fires once and early; the app must keep it even when the mobile
//     screen loads later (slow connection), so the dialog gets its «نصب» button;
//   - the written guide never sends people to «افزودن به صفحه اصلی» (that only makes a shortcut) and explains the badge;
//   - the address has no «?mode=mobile» suffix; both manifests agree; Chrome's own installability check finds no error.
// What cannot be proven here: that a phone on a network without access to Google's WebAPK service gets a real app.

async function open(page: Page, baseURL: string, path = '/', options: { mobileChunkDelayMs?: number } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin || url.pathname.endsWith('.php')) return route.abort();
    if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
    return route.continue();
  });
  if (options.mobileChunkDelayMs) {
    await page.route('**/assets/TechnicianMobileApp-*.js', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, options.mobileChunkDelayMs));
      await route.continue();
    });
  }
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    if (sessionStorage.getItem('pwa_seeded')) return;
    sessionStorage.setItem('pwa_seeded', '1');
    localStorage.setItem('tlift_manual_offline_v1', 'true');
    localStorage.setItem('tlift_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
    localStorage.setItem('tlift_customer_session', JSON.stringify({ id: 'test', name: 'همکار آزمایشی', role: 'admin', phone: '09000000000' }));
    localStorage.setItem('tlift_contracts', JSON.stringify([{ id: 1, no: 'P-1', building: 'ساختمان آزمایشی', manager: 'مدیر', address: 'آدرس', zone: 'آزمایشی', monthlyServiceFee: 1000000, kind: 'general', start: '1404/01/01', end: '1405/12/29' }]));
  });
  await page.goto(path);
}

const installIcon = async (page: Page) => {
  await page.getByText('ابزارهای همگام‌سازی و برنامه').click();            // the header tools are folded until this is tapped
  return page.getByRole('button', { name: 'نصب برنامه T_lift' });
};
const openInstallDialog = async (page: Page) => { await (await installIcon(page)).click(); };
type Win = { __prompted?: number; __claimed?: boolean };

test('an install offer that fires BEFORE the slow mobile screen has loaded still gives the dialog its «نصب» button', async ({ page, baseURL }) => {
  // Chrome fires the offer shortly after load; on a slow connection the lazy mobile screen arrives much later.
  await page.addInitScript(() => {
    window.addEventListener('load', () => setTimeout(() => {
      const offer = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string; platform: string }> };
      offer.prompt = async () => { (window as unknown as Win).__prompted = ((window as unknown as Win).__prompted || 0) + 1; };
      offer.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      (window as unknown as Win).__claimed = !window.dispatchEvent(offer); // false = somebody called preventDefault = the app caught it
    }, 150));
  });
  await open(page, baseURL!, '/', { mobileChunkDelayMs: 2500 });
  // the offer has been fired and claimed while the mobile screen (and with it the install dialog) does not exist yet
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__claimed), { timeout: 10000 }).toBe(true);
  expect(await page.locator('.classic-job-row').count(), 'the mobile screen is still loading').toBe(0);
  await page.locator('.classic-job-row').first().waitFor({ timeout: 20000 });

  await openInstallDialog(page);
  const install = page.getByRole('button', { name: /نصب فوری «T_lift» روی صفحه اصلی/ });
  await expect(install).toBeVisible();
  await expect(page.locator('[data-install-note]')).toContainText('بدون نشان کوچک Chrome');
  await expect(page.locator('[data-install-guide]')).toHaveCount(0);
  await install.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__prompted)).toBe(1);   // Chrome's own install sheet was requested
  await expect(page.getByRole('heading', { name: /برنامه\s+T_lift/ })).toHaveCount(0);            // accepted → dialog closes
});

test('without an install offer the guide says «نصب برنامه» – never «افزودن به صفحه اصلی» – and explains the Chrome badge and the Google-services cause', async ({ page, baseURL }) => {
  await open(page, baseURL!);
  await openInstallDialog(page);
  const dialog = page.locator('div.fixed', { has: page.getByRole('heading', { name: /برنامه\s+T_lift/ }) });
  const guide = dialog.locator('[data-install-guide="chrome"]');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('«نصب برنامه» (Install app)');
  await expect(guide).toContainText('«افزودن به صفحه اصلی» (Add to Home screen) را نزنید');
  await expect(guide).toContainText('فقط یک میان‌بر می‌سازد');
  const text = await dialog.innerText();
  expect(text).not.toMatch(/یا\s*«افزودن به صفحه اصلی»/);      // the old guide offered it as an equal alternative
  expect(text).not.toContain('APK و وب');                        // there is no APK download any more
  const help = dialog.locator('[data-shortcut-help]');
  await expect(help).toContainText('نشان کوچک Chrome');
  await expect(help).toContainText('میان‌بر');
  await expect(help).toContainText('سرور گوگل');
  await expect(help).toContainText('آن آیکن را از صفحهٔ اصلی پاک کنید');
  // the direct address is clean
  await expect(dialog).toContainText(new URL(baseURL!).origin + '/');
  expect(text).not.toContain('mode=mobile');
  // the update and copy-link tools of the dialog are still there
  await expect(dialog.getByRole('button', { name: /بررسی و اعمال آخرین آپدیت/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /کپی لینک/ })).toBeVisible();
});

test.describe('other browsers get the right instructions', () => {
  test.describe('Android in-app browser (WebView)', () => {
    test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36' });
    test('tells the user to open the address in Chrome', async ({ page, baseURL }) => {
      await open(page, baseURL!);
      await openInstallDialog(page);
      await expect(page.locator('[data-install-webview]')).toContainText('داخل مرورگر داخلی');
      await expect(page.locator('[data-install-webview]')).toContainText('Chrome');
    });
  });
  test.describe('iPhone', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
    test('gets the Safari «Add to Home Screen» steps (that one makes a real standalone app there)', async ({ page, baseURL }) => {
      await open(page, baseURL!);
      await openInstallDialog(page);
      const guide = page.locator('[data-install-guide="ios"]');
      await expect(guide).toContainText('Add to Home Screen');
      await expect(guide).toContainText('Safari');
      await expect(page.locator('[data-install-guide="chrome"]')).toHaveCount(0);
    });
  });
});

test('both manifests agree, the start address is clean, and Chrome itself reports the app as installable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL!, serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    const fetchJson = async (path: string) => JSON.parse(await (await page.request.get(baseURL! + path)).text());
    const [staticManifest, generated] = [await fetchJson('/manifest.json'), await fetchJson('/manifest.webmanifest')];
    for (const manifest of [staticManifest, generated]) {
      expect(manifest.start_url).toBe('/');
      expect(manifest.id).toBe('/asemansara-app-v3');
      expect(manifest.scope).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.name).toBe('T_lift');
    }
    const iconKey = (manifest: { icons: Array<{ src: string; sizes: string; purpose: string }> }) => manifest.icons.map((icon) => `${icon.src}|${icon.sizes}|${icon.purpose}`).sort();
    expect(iconKey(generated)).toEqual(iconKey(staticManifest));

    await page.routeWebSocket('**/*', (socket) => socket.close());
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseURL!).origin || url.pathname.endsWith('.php')) return route.abort();
      if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
      return route.continue();
    });
    await page.goto('/');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true);
    await page.reload();
    await page.waitForTimeout(1200);
    const cdp = await context.newCDPSession(page);
    const app = await cdp.send('Page.getAppManifest');
    expect(app.errors).toEqual([]);
    expect(app.url).toMatch(/\/manifest\.json$/);
    const installability = await cdp.send('Page.getInstallabilityErrors');
    expect(installability.installabilityErrors, 'Chrome\'s installability check').toEqual([]);
  } finally {
    await context.close();
  }
});

test('an old shortcut that opens «/?mode=mobile» loses that useless suffix from the address', async ({ page, baseURL }) => {
  await open(page, baseURL!, '/?mode=mobile');
  await page.locator('.classic-job-row').first().waitFor();
  expect(new URL(page.url()).search).toBe('');
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.locator('.classic-page-title')).toBeVisible();   // the mobile screen is still what opens
});

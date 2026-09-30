import { test, expect } from '@playwright/test';

for (const width of [360, 390, 480]) {
  test(`classic home, service and calendar at ${width}px preserve real data`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 844 });
    await page.routeWebSocket('**/*', socket => socket.close());
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(baseURL!).origin || url.pathname.endsWith('.php')) return route.abort();
      if (url.pathname === '/data/tlift-bootstrap.json') return route.fulfill({ json: { entries: {} } });
      return route.continue();
    });
    await page.addInitScript(() => {
      if (window.top !== window.self) return;
      localStorage.setItem('tlift_manual_offline_v1', 'true');
      localStorage.setItem('tlift_csv_seeded_v1', 'true');
      localStorage.setItem('tlift_cust_csv_seeded_v1', 'true');
      localStorage.setItem('tlift_customer_session', JSON.stringify({ id:'test', name:'همکار آزمایشی', role:'admin', phone:'09000000000' }));
      localStorage.setItem('tlift_contracts', JSON.stringify([{ id:990001, no:'TEST-42', building:'ساختمان آزمایشی', manager:'مدیر آزمایشی', address:'آدرس آزمایشی بدون داده واقعی', zone:'آزمایشی', monthlyServiceFee:1234567, kind:'general', start:'1404/01/01', end:'1405/12/29' }]));
      localStorage.setItem('tlift_contract_details', JSON.stringify({990001:{months:[{id:1,m:'فروردین',y:1404,done:false,paid:false,amount:1234567,plannedDate:'1404/01/01',deviceNo:'A'}],payments:[],invoices:[],breakdowns:[]}}));
    });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name:'ناوبری موبایل' });
    await expect(nav.getByRole('button')).toHaveCount(4);
    await expect(page.getByText('کار فعالی ندارید', {exact:true})).toBeVisible();
    await expect(page.getByText(/کارهای تاریخ گذشته/)).toBeVisible();
    await expect(page.locator('.classic-home-actions > button')).toHaveCount(3);
    await expect(page.locator('.classic-home-extra > button')).toHaveCount(4);
    await expect(page.getByRole('button',{name:'کلید سه‌گوش',exact:true})).toBeVisible();
    await expect(page.locator('.classic-job-row').first()).toContainText('سرویس فروردین 1404');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('body')).not.toContainText('زمان دستگاه نیاز به هماهنگی دارد');
    await page.locator('.classic-job-row').first().click();
    await expect(page.getByRole('heading', {name:'اطلاعات سرویس ساختمان آزمایشی'})).toBeVisible();
    await expect(page.getByText('جزئیات ضروری پیش از شروع کار')).toBeVisible();
    await expect(page.getByText('موقعیت ساختمان ثبت نشده است', {exact:true})).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByText('عکسی پیوست نشده است')).toBeVisible();
    await expect(page.getByText('مبلغ سرویس ماهیانه', {exact:true})).toBeVisible();
    await expect(page.locator('.classic-detail-table')).toContainText('۱٬۲۳۴٬۵۶۷');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({path:'test-results/classic-service.png',fullPage:true});
    await page.getByRole('button', {name:'بازگشت',exact:true}).click();
    if (width === 390) await page.screenshot({path:'test-results/classic-home.png',fullPage:true});
    await nav.getByRole('button', {name:'تقویم',exact:true}).click();
    await expect(page.locator('.classic-calendar')).toHaveCSS('background-color','rgb(48, 48, 48)');
    const before = await page.locator('.classic-calendar').innerText();
    await page.getByRole('button',{name:'ماه بعدی',exact:true}).click();
    expect(await page.locator('.classic-calendar').innerText()).not.toBe(before);
    await page.getByRole('button',{name:'ماه قبلی',exact:true}).click();
    await page.locator('.classic-calendar button[aria-pressed]').first().click();
    await expect(page.locator('.classic-calendar button[aria-pressed=true]')).toHaveCount(1);
    if (width === 390) await page.screenshot({path:'test-results/classic-calendar.png',fullPage:true});
    await nav.getByRole('button',{name:'خانه',exact:true}).click();
    await expect(page.getByRole('button',{name:'کلید سه‌گوش',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'نمایش سایر امکانات',exact:true}).click();
    await expect(page.getByRole('button',{name:'ثبت سرویس آفلاین',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  });
}

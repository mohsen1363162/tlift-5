// Fail closed when opened outside the Playwright-isolated context. No production
// module is imported before the network interception/fixture gate is installed.
if (!(window as any).__TLIFT_TEST_ISOLATED__) {
  document.getElementById('root')!.textContent = 'این صفحه فقط توسط آزمون ایزوله اجرا می‌شود.';
} else {
  void (async () => {
    const [sync, backup, daily, store] = await Promise.all([
      import('../../src/cloudSync'), import('../../src/utils/fullBackup'),
      import('../../src/utils/dailyBackups'), import('../../src/store'),
    ]);
    Object.assign(window, { testApi: { sync, backup, daily, appStore: store.appStore } });
    await import('../../src/main');
  })();
}

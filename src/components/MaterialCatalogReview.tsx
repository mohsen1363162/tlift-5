import { useMemo, useState } from 'react';
import { Download, FileCheck2, X } from 'lucide-react';
import { MATERIAL_CATALOG, MATERIAL_SOURCE_COUNT } from '../data/materialCatalog';
import { partsApi, useParts } from '../partsStore';
import type { Theme } from '../theme';

export default function MaterialCatalogReview({ t, canImport }: { t: Theme; canImport: boolean }) {
  const parts = useParts();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const preview = useMemo(() => {
    try { return { plan: partsApi.previewMaterialImport(), error: '' }; }
    catch (error) { return { plan: null, error: error instanceof Error ? error.message : 'فهرست فعلی قابل پردازش نیست.' }; }
  }, [parts]);
  const plan = preview.plan;
  const changes = plan ? plan.added + plan.updated + plan.archived : 0;
  const apply = () => {
    if (!canImport || !plan || !changes) return;
    if (!window.confirm(`فهرست بررسی‌شده با مبلغ ریال اعمال شود؟\n${plan.added} قلم جدید، ${plan.updated} به‌روزرسانی و ${plan.archived} تکراری بدون موجودی بایگانی می‌شود.\nقیمت بالاتر حفظ می‌شود. موجودی‌ها جمع نمی‌شوند و گزارش‌های قبلی تغییر نمی‌کنند.`)) return;
    try {
      const result = partsApi.applyMaterialImport();
      setMessage(`فهرست ذخیره شد: ${result.added} قلم جدید، ${result.updated} به‌روزرسانی و ${result.archived} ادغام. نسخه قبل از اعمال روی همین دستگاه محفوظ است.${result.warnings.length ? ' موارد نیازمند بررسی را پایین ببینید.' : ''}`);
    } catch (error) { setMessage(`اعمال فهرست انجام نشد: ${error instanceof Error ? error.message : 'خطای ذخیره‌سازی'}`); }
  };
  return <>
    <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${t.border} ${t.panel}`}>
      <div><b className={`text-sm ${t.text}`}>فهرست بازبینی‌شده قطعات و خدمات</b>
        <p className={`mt-1 text-xs ${t.sub}`}>{MATERIAL_SOURCE_COUNT.toLocaleString('fa-IR')} ردیف ارسالی ← {MATERIAL_CATALOG.length.toLocaleString('fa-IR')} قلم؛ قیمت بالاتر هر گروه، به ریال</p>
      </div>
      <button onClick={() => setOpen(true)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"><FileCheck2 size={15} className="ml-1 inline"/>بررسی و اعمال فهرست قطعات</button>
    </div>
    {open && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" aria-labelledby="material-catalog-title">
      <div className={`flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border ${t.panel} ${t.border}`}>
        <div className={`flex items-start justify-between gap-3 border-b p-4 ${t.border}`}>
          <div><h2 id="material-catalog-title" className={`font-bold ${t.text}`}>بازبینی ادغام قطعات و قیمت‌ها</h2>
            <p className={`mt-1 text-xs leading-6 ${t.sub}`}>قیمت‌های ارسال‌شده ریال هستند. قیمت بالاتر فعلی نیز کاهش نمی‌یابد. ردیف‌های دارای موجودی برای انبارگردانی نگه داشته می‌شوند؛ بایگانی تکراری‌ها، سوابق سرویس و امانت‌ها را حذف نمی‌کند.</p></div>
          <button aria-label="بستن بازبینی قطعات" onClick={() => setOpen(false)} className="rounded p-2"><X size={20}/></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {(message || preview.error) && <p role="status" className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">{message || preview.error}</p>}
          {plan && <div className={`mb-3 text-xs ${t.text}`}>پیش‌نمایش دستگاه فعلی: {plan.added} قلم جدید · {plan.updated} به‌روزرسانی · {plan.archived} تکراری بدون موجودی برای بایگانی</div>}
          {!!plan?.warnings.length && <details className="mb-3 rounded-xl border border-amber-300 p-3" open><summary className="text-xs font-bold text-amber-700">موارد نیازمند بررسی موجودی یا مشخصات ({plan.warnings.length})</summary><ul className={`mt-2 list-inside list-disc space-y-1 text-xs ${t.text}`}>{plan.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
          <table className="w-full text-right text-xs">
            <thead className={t.head}><tr>{['کد و نام نهایی', 'واحد', 'قیمت منتخب فهرست (ریال)', 'نام‌ها، کدها و مبلغ‌های قبلی / توضیح'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
            <tbody>{MATERIAL_CATALOG.map(entry => <tr key={entry.code} className={`border-b ${t.border}`}>
              <td className={`p-2 font-bold ${t.text}`}>{entry.name}<div className="mt-1 font-mono text-indigo-500">{entry.code}</div></td>
              <td className={`p-2 ${t.sub}`}>{entry.unit}</td><td className={`whitespace-nowrap p-2 font-bold ${t.text}`}>{entry.price.toLocaleString('fa-IR')}</td>
              <td className={`p-2 leading-6 ${t.sub}`}>
                {entry.sources.map(source => <div key={source.code}>{source.code} — {source.name}: {source.price.toLocaleString('fa-IR')} ریال{entry.sources.length > 1 && source.price === entry.price ? ' (بیشترین مبلغ)' : ''}</div>)}
                {entry.reason && <p className="text-emerald-600">ادغام: {entry.reason}</p>}
                {entry.review && <p className="text-amber-600">جدا نگه داشته شد: {entry.review}</p>}
              </td></tr>)}</tbody>
          </table>
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-2 border-t p-4 ${t.border}`}>
          <a href="/material-catalog-review.csv" download className={`rounded-lg border px-3 py-2 text-xs ${t.text}`}><Download size={14} className="ml-1 inline"/>دانلود گزارش قیمت و ادغام</a>
          {canImport ? <button onClick={apply} disabled={!changes || !!preview.error} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{changes ? 'اعمال فهرست روی قطعات من' : 'فهرست روی این دستگاه به‌روز است'}</button> : <span className={`text-xs ${t.sub}`}>اعمال فهرست توسط مدیر انجام می‌شود.</span>}
        </div>
      </div>
    </div>}
  </>;
}

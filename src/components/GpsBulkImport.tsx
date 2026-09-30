import { useMemo, useRef, useState } from "react";
import { Download, MapPin, Upload, X } from "lucide-react";
import type { Theme } from "../theme";
import { appStore, useCompanyAccessSettings, useContractGeoLocations, useContracts } from "../store";
import {
  applicableRows,
  entriesFromPlan,
  missingGeoCount,
  missingGeoCsv,
  planGeoImport,
  type GeoRowStatus,
} from "../utils/geoImport";

/*
 * «موقعیت GPS ساختمان‌ها» در مرکز اطلاعات ناقص: میزان پوشش، خروجی فهرست ساختمان‌های بدون موقعیت (برای پر کردن عرض و طول)
 * و ورود گروهی از CSV/TSV یا متن چسبانده‌شده. قبل از ذخیره، برای هر سطر معلوم است چه می‌شود؛ چیزی بی‌صدا نوشته نمی‌شود.
 */

const fa = (value: number) => value.toLocaleString("fa-IR");
const STATUS_LABEL: Record<GeoRowStatus, string> = {
  new: "جدید",
  replace: "جایگزین می‌شود",
  same: "بدون تغییر",
  keep: "از قبل ثبت‌شده",
  empty: "خالی",
  noMatch: "قرارداد پیدا نشد",
  ambiguous: "مبهم",
  invalid: "نامعتبر",
  duplicate: "تکراری",
};
const STATUS_TONE: Record<GeoRowStatus, string> = {
  new: "bg-emerald-500/15 text-emerald-600",
  replace: "bg-blue-500/15 text-blue-600",
  same: "bg-gray-500/15 text-gray-500",
  keep: "bg-gray-500/15 text-gray-500",
  empty: "bg-gray-500/10 text-gray-400",
  noMatch: "bg-red-500/15 text-red-600",
  ambiguous: "bg-amber-500/20 text-amber-600",
  invalid: "bg-red-500/15 text-red-600",
  duplicate: "bg-amber-500/20 text-amber-600",
};
const PROBLEM: GeoRowStatus[] = ["invalid", "noMatch", "ambiguous", "duplicate"];
const MAX_SHOWN = 200;

/** فایل اکسل ایرانی گاهی با کدگذاری ویندوز-۱۲۵۶ ذخیره می‌شود؛ اگر UTF-8 خراب خواند، همان را امتحان می‌کنیم. */
async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("windows-1256").decode(buffer);
  } catch {
    return utf8;
  }
}

export default function GpsBulkImport({ t }: { t: Theme }) {
  const contracts = useContracts();
  const geos = useContractGeoLocations();
  const access = useCompanyAccessSettings();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const registered = useMemo(() => {
    const have = new Set(geos.map((item) => item.contractId));
    return contracts.filter((contract) => have.has(contract.id)).length;
  }, [contracts, geos]);
  const missing = useMemo(() => missingGeoCount(contracts, geos), [contracts, geos]);
  const percent = contracts.length ? Math.round((registered / contracts.length) * 100) : 0;

  const plan = useMemo(
    () => (open && text.trim() ? planGeoImport(text, contracts, geos, { overwrite }) : null),
    [open, text, contracts, geos, overwrite]
  );
  const applicable = plan ? applicableRows(plan) : [];
  const shown = useMemo(() => {
    if (!plan) return [];
    const visible = plan.rows.filter((row) => row.status !== "empty");
    const rank = (status: GeoRowStatus) => (PROBLEM.includes(status) ? 0 : status === "new" || status === "replace" ? 1 : 2);
    return [...visible].sort((a, b) => rank(a.status) - rank(b.status) || a.line - b.line);
  }, [plan]);

  const downloadMissing = () => {
    const url = URL.createObjectURL(new Blob([missingGeoCsv(contracts, geos)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "tlift-buildings-without-gps.csv";
    link.click();
    URL.revokeObjectURL(url);
    setMessage(`فهرست ${fa(missing)} ساختمان بدون موقعیت دانلود شد؛ ستون‌های عرض و طول را پر کنید و با «ورود موقعیت‌ها» برگردانید.`);
  };

  const close = () => {
    setOpen(false);
    setText("");
    setFileName("");
    setOverwrite(false);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await readTextFile(file));
    setFileName(file.name);
  };

  const apply = () => {
    if (!plan || !applicable.length) return;
    const result = appStore.setContractGeoLocations(entriesFromPlan(plan, Date.now()));
    const ignored = plan.rows.length - applicable.length;
    setMessage(
      `${fa(result.saved)} موقعیت ثبت شد (${fa(result.added)} جدید، ${fa(result.replaced)} جایگزین)` +
        `${ignored ? `؛ ${fa(ignored)} سطر دیگر ثبت نشد` : ""}. با همگام‌سازی بعدی در همهٔ دستگاه‌ها دیده می‌شود.`
    );
    close();
  };

  const counts = plan?.counts;
  return (
    <section aria-label="موقعیت GPS ساختمان‌ها" className={`mb-4 rounded-2xl border p-4 ${t.panel} ${t.border}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-60 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-black">
            <MapPin size={16} className="text-emerald-500" /> موقعیت GPS ساختمان‌ها
          </h2>
          <p className={`mt-1 text-[11px] ${t.sub}`}>
            نقشهٔ «نزدیک من» و مسیریابی فقط برای ساختمان‌هایی کار می‌کند که موقعیتشان ثبت شده؛ برای بقیه هیچ نقطهٔ فرضی ساخته نمی‌شود.
            همکار هنگام سرویس با «ثبت موقعیت همین‌جا» یا شما با فایل زیر می‌توانید پوشش را کامل کنید.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="پوشش موقعیت GPS"
              className="h-2 flex-1 overflow-hidden rounded-full bg-gray-500/20"
            >
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs font-bold" data-testid="gps-coverage">
              {fa(registered)} از {fa(contracts.length)} ساختمان ({fa(percent)}٪)
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadMissing}
            disabled={!missing}
            className="rounded-xl border border-emerald-500 px-3 py-2 text-[11px] font-bold text-emerald-600 disabled:opacity-40"
          >
            <Download size={13} className="ml-1 inline" /> فهرست ساختمان‌های بدون موقعیت (CSV)
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"
          >
            <Upload size={13} className="ml-1 inline" /> ورود موقعیت‌ها از فایل یا متن
          </button>
        </div>
      </div>
      {message && (
        <div role="status" className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-600">
          {message}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ورود گروهی موقعیت ساختمان‌ها"
            dir="rtl"
            className={`max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl p-5 ${t.panel} ${t.text}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-black">ورود گروهی موقعیت ساختمان‌ها</h2>
              <button type="button" aria-label="بستن" onClick={close} className="rounded-lg p-1 hover:bg-gray-500/20">
                <X size={18} />
              </button>
            </div>
            <p className={`mt-2 text-[11px] leading-6 ${t.sub}`}>
              هر سطر: <b>شماره قرارداد</b>، <b>عرض جغرافیایی</b>، <b>طول جغرافیایی</b> (یا «عرض، طول» در یک خانه مثل کپی از Google Maps).
              جداکننده می‌تواند ویرگول، نقطه‌ویرگول یا تب باشد و ارقام فارسی هم پذیرفته می‌شود. اگر شماره قرارداد نباشد، نام دقیق ساختمان
              هم کار می‌کند. بهترین راه: فهرست بالا را دانلود و فقط دو ستون آخر را پر کنید. مختصات باید حداقل ۴ رقم اعشار داشته باشد.
            </p>
            {access.gpsRequired && (
              <div role="note" className="mt-3 rounded-xl bg-amber-500/15 p-3 text-[11px] leading-6 text-amber-700">
                الزام «حضور در محل برای شروع سرویس» فعال است (شعاع {fa(access.gpsRadiusMeters)} متر). مختصات نادقیق باعث می‌شود همکار در
                محل واقعی نتواند سرویس را شروع کند؛ فقط مختصات دقیق وارد کنید.
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                aria-label="انتخاب فایل CSV موقعیت‌ها"
                onChange={(event) => void pickFile(event.target.files?.[0])}
                className="text-xs"
              />
              {fileName && <span className={`text-[11px] ${t.sub}`}>{fileName}</span>}
            </div>
            <textarea
              aria-label="متن CSV موقعیت‌ها"
              value={text}
              onChange={(event) => { setText(event.target.value); setFileName(""); }}
              placeholder={"شماره قرارداد,عرض جغرافیایی,طول جغرافیایی\n101,36.268801,50.004124"}
              dir="ltr"
              rows={6}
              className={`mt-2 w-full rounded-xl border p-3 font-mono text-xs ${t.input}`}
            />
            <label className="mt-2 flex items-center gap-2 text-xs">
              <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
              موقعیت‌های قبلاً ثبت‌شده هم با مقدار فایل جایگزین شوند (پیش‌فرض: دست نخورده می‌مانند)
            </label>

            {plan?.problem && (
              <div role="alert" className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-600">
                {plan.problem}
              </div>
            )}

            {plan && !plan.problem && counts && (
              <>
                <div className="mt-3 flex flex-wrap gap-1.5" aria-label="خلاصهٔ پیش‌نمایش">
                  {(Object.keys(STATUS_LABEL) as GeoRowStatus[])
                    .filter((status) => counts[status] > 0)
                    .map((status) => (
                      <span key={status} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[status]}`}>
                        {STATUS_LABEL[status]}: {fa(counts[status])}
                      </span>
                    ))}
                </div>
                <div className={`mt-3 max-h-72 overflow-auto rounded-xl border ${t.border}`}>
                  <table className="w-full text-[11px]">
                    <thead className={`sticky top-0 ${t.head}`}>
                      <tr className="text-right">
                        <th className="p-2">سطر</th>
                        <th className="p-2">ساختمان / متن سطر</th>
                        <th className="p-2">وضعیت</th>
                        <th className="p-2">مختصات / توضیح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.slice(0, MAX_SHOWN).map((row) => (
                        <tr key={row.line} className={`border-t ${t.border}`}>
                          <td className="p-2">{fa(row.line)}</td>
                          <td className="max-w-56 truncate p-2">{row.building || row.source}</td>
                          <td className="p-2">
                            <span className={`rounded-full px-2 py-0.5 font-bold ${STATUS_TONE[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                          </td>
                          <td className="p-2">
                            {row.latitude !== undefined && row.longitude !== undefined && (row.status === "new" || row.status === "replace") ? (
                              <span dir="ltr" className="font-mono">
                                {row.latitude.toFixed(6)}, {row.longitude.toFixed(6)}
                              </span>
                            ) : (
                              row.reason
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {shown.length > MAX_SHOWN && (
                    <div className={`p-2 text-center text-[11px] ${t.sub}`}>و {fa(shown.length - MAX_SHOWN)} سطر دیگر (اول سطرهای مشکل‌دار نمایش داده می‌شوند)</div>
                  )}
                </div>
              </>
            )}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={close} className={`rounded-xl border px-4 py-2 text-xs ${t.border}`}>
                انصراف
              </button>
              <button
                type="button"
                onClick={apply}
                disabled={!applicable.length}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                {applicable.length ? `ثبت ${fa(applicable.length)} موقعیت` : "موردی برای ثبت نیست"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

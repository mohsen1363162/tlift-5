import { useMemo, useState } from "react";
import { KeyRound, Printer, Search, Save, X } from "lucide-react";
import type { Theme } from "../theme";
import { appStore, useContracts } from "../store";
import type { Contract } from "../data";
import { useAuth } from "../contexts/AuthContext";

export default function TriangleKeyLocationsPage({
  t,
  onShowToast,
}: {
  t: Theme;
  onShowToast: (message: string) => void;
}) {
  const contracts = useContracts();
  const { currentUserInfo } = useAuth();
  const canEdit = currentUserInfo?.role === "admin" || currentUserInfo?.role === "technician";
  const canPrint = currentUserInfo?.role === "admin" || currentUserInfo?.role === "staff";
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Contract | null>(null);
  const [location, setLocation] = useState("");
  const [cleaningDates, setCleaningDates] = useState<string[]>([]);
  const [oilDates, setOilDates] = useState<string[]>([]);
  const [newCleaningDate, setNewCleaningDate] = useState("");
  const [newOilDate, setNewOilDate] = useState("");
  const [listMode, setListMode] = useState<"search" | "noCleaning" | "noOil">("search");

  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("fa");
    if (listMode === "noCleaning") return contracts.filter((contract) => !(contract.cleaningDates || []).length);
    if (listMode === "noOil") return contracts.filter((contract) => !(contract.motorOilChangeDates || []).length);
    if (q.length < 2) return [];
    return contracts
      .filter((contract) =>
        [contract.building, contract.buildingName, contract.manager, contract.customer, contract.phone, contract.coordinator, contract.coordinatorPhone, contract.no]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase("fa").includes(q))
      )
      .slice(0, 50);
  }, [contracts, query, listMode]);

  const lastDate = (dates?: string[]) => dates?.length ? dates[dates.length - 1] : "ثبت نشده";
  const addDate = (value: string, dates: string[], setter: (value: string[]) => void, clear: () => void) => {
    const normalized = value.trim().replace(/-/g, "/");
    if (!/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(normalized)) return onShowToast("تاریخ را مانند ۱۴۰۵/۰۷/۱۵ وارد کنید");
    setter([...dates, normalized]);
    clear();
  };

  const printLocations = () => {
    const printable = listMode === "search" ? contracts : results;
    const rows = printable.map((contract, index) => `<tr><td>${index + 1}</td><td>${contract.building.replace(/^\*\s*/, "")}</td><td>${contract.manager || "-"}</td><td>${contract.no}</td><td>${contract.triangleKeyLocation || ""}</td><td>${lastDate(contract.cleaningDates)}</td><td>${lastDate(contract.motorOilChangeDates)}</td></tr>`).join("");
    const popup = window.open("", "_blank", "width=1000,height=700");
    if (!popup) return onShowToast("مرورگر پنجره چاپ را مسدود کرده است");
    popup.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>جدول محل کلیدهای سه‌گوش</title><style>body{font-family:Tahoma,sans-serif;padding:24px;color:#111}h1{font-size:18px;text-align:center;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #555;padding:8px;text-align:right}th{background:#eee}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>جدول محل کلیدهای سه‌گوش نجات اضطراری</h1><table><thead><tr><th>ردیف</th><th>ساختمان</th><th>مشتری / مسئول</th><th>قرارداد</th><th>محل کلید سه‌گوش</th><th>آخرین نظافت</th><th>آخرین تعویض روغن موتور</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const startEdit = (contract: Contract) => {
    setEditing(contract);
    setLocation(contract.triangleKeyLocation || "");
    setCleaningDates([...(contract.cleaningDates || [])]);
    setOilDates([...(contract.motorOilChangeDates || [])]);
    setNewCleaningDate("");
    setNewOilDate("");
  };

  const save = () => {
    if (!editing) return;
    appStore.updateContract({
      ...editing,
      triangleKeyLocation: location.trim() || undefined,
      cleaningDates,
      motorOilChangeDates: oilDates,
      maintenanceLastEditedBy: currentUserInfo?.name || "کاربر سیستم",
      maintenanceLastEditedAt: Date.now(),
    });
    setEditing(null);
    setLocation("");
    onShowToast("محل کلید سه‌گوش ذخیره شد");
  };

  return (
    <div dir="rtl" className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className={`mx-auto max-w-4xl rounded-2xl border p-4 shadow-sm sm:p-6 ${t.card} ${t.border}`}>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <KeyRound size={23} />
          </div>
          <div className="flex-1">
            <h1 className={`text-base font-bold ${t.text}`}>محل کلید سه‌گوش</h1>
            <p className={`mt-1 text-xs ${t.sub}`}>دسترسی سریع به محل کلید نجات اضطراری ساختمان‌ها</p>
          </div>
          {canPrint && <button type="button" onClick={printLocations} className="flex items-center gap-2 rounded-lg bg-slate-700 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800">
            <Printer size={16} /> چاپ جدول
          </button>}
        </div>

        <div className={`flex items-center gap-2 rounded-xl border px-3 ${t.input} ${t.border}`}>
          <Search size={18} className={t.sub} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="نام ساختمان، مشتری، مسئول هماهنگی یا شماره قرارداد را جستجو کنید"
            className="h-12 w-full bg-transparent text-sm outline-none"
          />
          {query && <button type="button" onClick={() => setQuery("")}><X size={17} className={t.sub} /></button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setListMode("search")} className={`rounded-lg px-3 py-2 text-xs ${listMode === "search" ? "bg-blue-600 text-white" : `${t.hover} ${t.sub}`}`}>جستجوی ساختمان</button>
          <button type="button" onClick={() => setListMode("noCleaning")} className={`rounded-lg px-3 py-2 text-xs ${listMode === "noCleaning" ? "bg-amber-600 text-white" : `${t.hover} ${t.sub}`}`}>فهرست فاقد سابقه نظافت</button>
          <button type="button" onClick={() => setListMode("noOil")} className={`rounded-lg px-3 py-2 text-xs ${listMode === "noOil" ? "bg-red-600 text-white" : `${t.hover} ${t.sub}`}`}>فهرست فاقد تعویض روغن</button>
        </div>

        {listMode === "search" && query.trim().length < 2 ? (
          <div className={`py-14 text-center text-sm ${t.sub}`}>برای حفظ محرمانگی، فهرست ساختمان‌ها نمایش داده نمی‌شود. حداقل دو حرف جستجو کنید.</div>
        ) : results.length === 0 ? (
          <div className={`py-14 text-center text-sm ${t.sub}`}>ساختمانی با این مشخصات پیدا نشد.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {results.map((contract) => (
              <div key={contract.id} className={`rounded-xl border p-4 ${t.border}`}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className={`font-semibold ${t.text}`}>{contract.building.replace(/^\*\s*/, "")}</div>
                    <div className={`mt-1 text-xs ${t.sub}`}>{contract.manager} · قرارداد {contract.no}</div>
                  </div>
                  {canEdit && <button type="button" onClick={() => startEdit(contract)} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700">
                    {contract.triangleKeyLocation ? "ویرایش اطلاعات نگهداری" : "ثبت اطلاعات نگهداری"}
                  </button>}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className={`rounded-lg border px-3 py-3 text-sm ${t.border} ${contract.triangleKeyLocation ? t.text : t.sub}`}><span className="mb-1 block text-xs font-medium text-red-500">محل کلید سه‌گوش</span>{contract.triangleKeyLocation || "ثبت نشده"}</div>
                  <div className={`rounded-lg border px-3 py-3 text-sm ${t.border} ${(contract.cleaningDates || []).length ? t.text : t.sub}`}><span className="mb-1 block text-xs font-medium text-amber-600">آخرین نظافت</span>{lastDate(contract.cleaningDates)}</div>
                  <div className={`rounded-lg border px-3 py-3 text-sm ${t.border} ${(contract.motorOilChangeDates || []).length ? t.text : t.sub}`}><span className="mb-1 block text-xs font-medium text-blue-600">آخرین تعویض روغن موتور</span>{lastDate(contract.motorOilChangeDates)}</div>
                </div>
                {contract.maintenanceLastEditedAt && <div className={`mt-2 text-[10px] ${t.sub}`}>آخرین ویرایش: {contract.maintenanceLastEditedBy || "کاربر سیستم"} — {new Date(contract.maintenanceLastEditedAt).toLocaleString("fa-IR")}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setEditing(null)}>
          <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${t.card} ${t.border}`} onClick={(event) => event.stopPropagation()}>
            <h2 className={`font-bold ${t.text}`}>محل کلید سه‌گوش — {editing.building.replace(/^\*\s*/, "")}</h2>
            <p className={`mt-1 text-xs ${t.sub}`}>محل دقیق و قابل فهم برای شرایط نجات اضطراری را بنویسید.</p>
            <textarea
              autoFocus
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="مثلاً: داخل جعبه آتش‌نشانی طبقه همکف، پشت کپسول"
              className={`mt-4 min-h-28 w-full rounded-xl border p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${t.input} ${t.border}`}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className={`rounded-xl border p-3 ${t.border}`}>
                <div className={`mb-2 text-xs font-bold ${t.text}`}>تاریخچه نظافت</div>
                <div className="flex gap-1"><input value={newCleaningDate} onChange={(e) => setNewCleaningDate(e.target.value)} placeholder="۱۴۰۵/۰۷/۱۵" className={`min-w-0 flex-1 rounded-lg border px-2 py-2 text-xs ${t.input} ${t.border}`} /><button type="button" onClick={() => addDate(newCleaningDate, cleaningDates, setCleaningDates, () => setNewCleaningDate(""))} className="rounded-lg bg-amber-600 px-3 text-white">+</button></div>
                <div className="mt-2 max-h-24 space-y-1 overflow-auto">{cleaningDates.map((date, index) => <div key={`${date}-${index}`} className={`flex justify-between rounded px-2 py-1 text-xs ${t.hover}`}><span>{date}</span><button type="button" onClick={() => setCleaningDates(cleaningDates.filter((_, i) => i !== index))} className="text-red-500">حذف</button></div>)}</div>
              </div>
              <div className={`rounded-xl border p-3 ${t.border}`}>
                <div className={`mb-2 text-xs font-bold ${t.text}`}>تاریخچه تعویض روغن موتور</div>
                <div className="flex gap-1"><input value={newOilDate} onChange={(e) => setNewOilDate(e.target.value)} placeholder="۱۴۰۵/۰۷/۱۵" className={`min-w-0 flex-1 rounded-lg border px-2 py-2 text-xs ${t.input} ${t.border}`} /><button type="button" onClick={() => addDate(newOilDate, oilDates, setOilDates, () => setNewOilDate(""))} className="rounded-lg bg-blue-600 px-3 text-white">+</button></div>
                <div className="mt-2 max-h-24 space-y-1 overflow-auto">{oilDates.map((date, index) => <div key={`${date}-${index}`} className={`flex justify-between rounded px-2 py-1 text-xs ${t.hover}`}><span>{date}</span><button type="button" onClick={() => setOilDates(oilDates.filter((_, i) => i !== index))} className="text-red-500">حذف</button></div>)}</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={save} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm text-white hover:bg-emerald-700"><Save size={16} /> ذخیره</button>
              <button type="button" onClick={() => setEditing(null)} className={`rounded-lg border px-5 py-2.5 text-sm ${t.border} ${t.hover}`}>انصراف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

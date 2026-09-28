import { useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, FileUp, MapPin, Phone, Search, XCircle } from "lucide-react";
import { appStore, useContracts, useZones } from "../store";
import type { Theme } from "../theme";

type ImportReport = { matched: number; canceled: number; total: number; regions: number; unmatched: Array<{region:string;name:string;phone?:string}> };
const fa = (value: number) => value.toLocaleString("fa-IR");
const ALVAND_REGIONS = ["مسکن مهر الوند","پشت مسکن مهر الوند","الوند امام سجاد","الوند سالن ورزشی معلولین","الوند امام حسن","الوند امام حسین","الوند کوی رجایی","الوند آزادی","الوند جابربن حیان","الوند رسالت","فلکه اول شهرصنعتی"];
const QAZVIN_REGIONS = ["قزوین ولیعصر","قزوین کوچه محمدیه","قزوین تهران قدیم","قزوین راه آهن","قزوین مرکز شهر","قزوین عارف خرم","میرداماد نواب","قزوین عارف سپهر","قزوین عارف متفرقه","قزوین لوازم","قزوین لوازم پارس شرقی","قزوین غیاث آباد","قزوین کوثر","قزوین مینودر","قزوین نوروزیان","قزوین حکیم","قزوین قائم","قزوین جانبازان","قزوین پونک","قزوین ملاصدراشرقی","قزوین ملاصدراغربی","قزوین دبیرسیاقی","قزوین دانشگاه سورتوک ولایت","قزوین فلسطین غربی بلوار","قزوین پادگان توحید"];
const canonical = (value: string) => value.replace(/[_-]+/g," ").replace(/\s+/g," ").trim();
const displayZoneName = (value: string) => canonical(value).replace(/^(?:الوند|قزوین)\s+/, "");

export default function ZonesPage({ t, onShowToast }: { t: Theme; onShowToast?: (msg: string) => void }) {
  const zones = useZones();
  const contracts = useContracts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<"الوند" | "قزوین" | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const orderedNames = selectedCity === "الوند" ? ALVAND_REGIONS : selectedCity === "قزوین" ? QAZVIN_REGIONS : [];
  const orderedZones = orderedNames.map((name, index) => zones.find(zone => canonical(zone.name) === name) || ({ id: -(index + 1), name, city: selectedCity || "", province: "قزوین" }));
  const filteredZones = orderedZones.filter(zone => !query.trim() || zone.name.includes(query.trim()));
  const zoneContracts = useMemo(() => contracts.filter(contract => canonical(contract.zone || "") === selectedZone && !contract.isCanceled), [contracts, selectedZone]);
  const getStatus = (contractId: number) => {
    const months = appStore.getContractDetails(contractId).months;
    const completed = [...months].filter(month => month.done).sort((a,b) => (b.date || "").localeCompare(a.date || ""))[0];
    const pending = months.find(month => !month.done);
    const currentParts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long" }).formatToParts(new Date());
    const currentMonth = currentParts.find(part => part.type === "month")?.value;
    const currentYear = Number((currentParts.find(part => part.type === "year")?.value || "0").replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
    const current = months.find(month => month.m === currentMonth && month.y === currentYear) || pending || completed;
    return { completed, pending, allDone: Boolean(current?.done) };
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const result = appStore.importRegionServiceList(text) as ImportReport;
      setReport(result);
      onShowToast?.(`${fa(result.matched)} قرارداد تطبیق داده شد؛ ${fa(result.canceled)} مورد کنسل کنار گذاشته شد.`);
    } catch { onShowToast?.("خواندن یا پردازش فایل ناموفق بود."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  if (selectedZone) return <div className={`h-full overflow-auto p-4 ${t.body} ${t.text}`} dir="rtl">
    <div className="mb-4 flex items-center justify-between"><div><button onClick={()=>setSelectedZone(null)} className={`mb-2 flex items-center gap-1 text-xs ${t.sub}`}><ChevronLeft size={15}/> بازگشت به منطقه‌ها</button><h1 className="flex items-center gap-2 text-lg font-black"><MapPin className="text-blue-500"/> {displayZoneName(selectedZone)}</h1><p className={`mt-1 text-xs ${t.sub}`}>{fa(zoneContracts.length)} قرارداد فعال</p></div></div>
    <div className="space-y-2">{zoneContracts.map(contract=>{const status=getStatus(contract.id);return <div key={contract.id} className={`rounded-2xl border p-4 ${t.panel} ${t.border}`}><div className="flex items-start justify-between gap-3"><div><div className="font-bold">{contract.building}</div><div className={`mt-1 text-xs ${t.sub}`}>{contract.manager}</div></div>{status.allDone?<span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold text-emerald-500"><CheckCircle2 size={14}/> انجام شده</span>:<span className="flex items-center gap-1 rounded-full bg-rose-500/15 px-3 py-1 text-[11px] font-bold text-rose-500"><XCircle size={14}/> انجام‌نشده</span>}</div>{contract.phone&&<a href={`tel:${contract.phone}`} className="mt-3 flex items-center gap-2 text-xs text-blue-500"><Phone size={14}/>{contract.phone}</a>}<div className={`mt-2 text-xs leading-6 ${t.sub}`}>{contract.address || "آدرس ثبت نشده"}</div>{contract.triangleKeyLocation&&<div className="mt-2 rounded-xl bg-amber-500/10 p-2 text-xs text-amber-600">محل کلید: {contract.triangleKeyLocation}</div>}{status.completed&&<div className="mt-3 rounded-xl bg-emerald-500/10 p-2 text-[11px] text-emerald-600">آخرین سرویس انجام‌شده: {status.completed.date || `${status.completed.m} ${status.completed.y}`} — {status.completed.doneBy || status.completed.techs?.[0] || "سرویس‌کار"}</div>}{status.pending&&<div className="mt-2 text-[11px] text-rose-500">سرویس باز: {status.pending.m} {status.pending.y}</div>}</div>})}{!zoneContracts.length&&<div className={`rounded-2xl border border-dashed py-16 text-center text-xs ${t.border} ${t.sub}`}>قرارداد فعالی در این منطقه تطبیق داده نشده است.</div>}</div>
  </div>;
  if (!selectedCity) return <div className={`h-full overflow-auto p-4 ${t.body} ${t.text}`} dir="rtl"><div className="mb-5"><h1 className="text-xl font-black">منطقه‌ها و سرویس‌ها</h1><p className={`mt-1 text-xs ${t.sub}`}>ابتدا شهر اصلی را انتخاب کنید.</p></div><div className="grid gap-4 sm:grid-cols-2"><button onClick={()=>setSelectedCity("قزوین")} className={`rounded-3xl border p-6 text-right transition hover:border-blue-400 ${t.panel} ${t.border}`}><MapPin className="mb-4 text-blue-500" size={30}/><b className="text-xl">۱. قزوین</b><p className={`mt-2 text-xs ${t.sub}`}>{fa(QAZVIN_REGIONS.length)} زیرگروه منطقه‌ای</p><div className="mt-4 text-xs font-bold text-blue-500">مشاهده منطقه‌های قزوین ←</div></button><button onClick={()=>setSelectedCity("الوند")} className={`rounded-3xl border p-6 text-right transition hover:border-emerald-400 ${t.panel} ${t.border}`}><MapPin className="mb-4 text-emerald-500" size={30}/><b className="text-xl">۲. الوند</b><p className={`mt-2 text-xs ${t.sub}`}>{fa(ALVAND_REGIONS.length)} زیرگروه منطقه‌ای</p><div className="mt-4 text-xs font-bold text-emerald-500">مشاهده منطقه‌های الوند ←</div></button></div></div>;
  return <div className={`h-full overflow-auto p-4 ${t.body} ${t.text}`} dir="rtl">
    <button onClick={()=>{setSelectedCity(null);setQuery("")}} className={`mb-3 flex items-center gap-1 text-xs ${t.sub}`}><ChevronLeft size={15}/> بازگشت به انتخاب شهر</button>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black">{selectedCity} — منطقه‌ها و سرویس‌ها</h1><p className={`mt-1 text-xs ${t.sub}`}>منطقه‌ها به ترتیب فایل برنامه کاری نمایش داده می‌شوند.</p></div><><input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={e=>importFile(e.target.files?.[0])}/><button disabled={busy} onClick={()=>fileRef.current?.click()} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50"><FileUp size={17}/>{busy?"در حال تطبیق...":"ورود و تطبیق فایل منطقه‌ها"}</button></></div>
    <div className={`mb-4 flex items-center gap-2 rounded-xl border px-3 ${t.input} ${t.border}`}><Search size={16} className={t.sub}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جستجوی منطقه..." className="h-11 flex-1 bg-transparent text-xs outline-none"/></div>
    {report&&<div className={`mb-4 rounded-2xl border p-4 ${t.panel} ${t.border}`}><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[["منطقه",report.regions],["رکورد",report.total],["تطبیق موفق",report.matched],["کنسل حذف‌شده",report.canceled]].map(([label,value])=><div key={String(label)} className="rounded-xl bg-blue-500/10 p-3 text-center"><b className="block text-lg text-blue-500">{fa(Number(value))}</b><span className={`text-[10px] ${t.sub}`}>{label}</span></div>)}</div>{report.unmatched.length>0&&<details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-amber-500">{fa(report.unmatched.length)} مورد تطبیق‌نیافته — نیازمند بررسی</summary><div className="mt-2 max-h-48 overflow-auto rounded-xl bg-amber-500/10 p-2 text-[11px] leading-6">{report.unmatched.map((item,index)=><div key={index}>{item.region} — {item.name} {item.phone?`— ${item.phone}`:""}</div>)}</div></details>}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filteredZones.map((zone,index)=>{const active=contracts.filter(contract=>canonical(contract.zone||"")===canonical(zone.name)&&!contract.isCanceled);const done=active.filter(contract=>getStatus(contract.id).allDone).length;return <button key={zone.id} onClick={()=>setSelectedZone(zone.name)} className={`rounded-2xl border p-4 text-right transition hover:border-blue-400 ${t.panel} ${t.border}`}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-xs font-black text-blue-500">{fa(index+1)}</span><b>{displayZoneName(zone.name)}</b></div><ChevronLeft size={17} className={t.sub}/></div><div className={`mt-3 flex gap-3 text-[11px] ${t.sub}`}><span>{fa(active.length)} سرویس</span><span className="text-emerald-500">{fa(done)} انجام‌شده</span><span className="text-rose-500">{fa(active.length-done)} باز</span></div></button>})}</div>
  </div>;
}

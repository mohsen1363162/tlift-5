import { useMemo, useState } from "react";
import { Activity, Clock3, PackageCheck, Wrench, Plus, Trash2, UserRound, TrendingUp, StopCircle, AlertTriangle, FileText } from "lucide-react";
import type { Theme } from "../theme";
import {
  appStore,
  useActiveServiceAssignments,
  useContracts,
  useStaff,
  useTechnicianPartDeliveries,
  useScheduledServices,
} from "../store";
import { useParts } from "../partsStore";
import NumberStepper from "./NumberStepper";

const fa = (value: number | string) => String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
const timeToMinutes = (value?: string) => {
  if (!value) return 0;
  const [h, m] = value.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

export default function TechnicianDashboard({ t }: { t: Theme }) {
  const staff = useStaff().filter((item) => item.service);
  const contracts = useContracts();
  const active = useActiveServiceAssignments();
  const deliveries = useTechnicianPartDeliveries();
  const parts = useParts();
  const assignments = useScheduledServices();
  const names = staff.map((item) => `${item.first} ${item.last}`.trim());
  const [selected, setSelected] = useState("همه سرویس‌کاران");
  const [partName, setPartName] = useState(parts[0]?.name || "");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const records = useMemo(() => {
    return contracts.flatMap((contract) =>
      appStore.getContractDetails(contract.id).months
        .filter((month) => month.done && (selected === "همه سرویس‌کاران" || month.doneBy === selected || month.techs?.includes(selected)))
        .map((month) => ({ contract, month }))
    );
  }, [contracts, selected]);

  const usedParts = records.flatMap(({ contract, month }) =>
    (month.partsList || []).map((part) => ({ ...part, building: contract.building, date: month.date || "—" }))
  );
  const workMinutes = records.reduce((sum, { month }) => {
    const start = timeToMinutes(month.inTime);
    const end = timeToMinutes(month.outTime);
    return sum + (end >= start ? end - start : 0);
  }, 0);
  const technicianDeliveries = deliveries.filter((item) => selected === "همه سرویس‌کاران" || item.technicianName === selected);
  const visibleAssignments = assignments.filter((item) => selected === "همه سرویس‌کاران" || item.technician === selected);
  const activeJob = selected === "همه سرویس‌کاران" ? undefined : active.find((item) => item.technicianName === selected);
  const usedCount = usedParts.reduce((sum, item) => sum + item.qty, 0);
  const deliveredCount = technicianDeliveries.reduce((sum, item) => sum + item.quantity, 0);

  const monthStats = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach(({ month }) => map.set(month.m, (map.get(month.m) || 0) + 1));
    return [...map.entries()].slice(-6);
  }, [records]);
  const maxMonth = Math.max(1, ...monthStats.map(([, count]) => count));

  const card = (title: string, value: string, icon: typeof Wrench, color: string) => {
    const Icon = icon;
    return (
      <div className={`rounded-2xl border p-4 ${t.panel} ${t.border} shadow-sm`}>
        <div className="flex items-center justify-between">
          <div><div className={`text-[11px] ${t.sub}`}>{title}</div><div className={`mt-2 text-2xl font-bold ${t.text}`}>{value}</div></div>
          <div className={`rounded-xl p-3 ${color}`}><Icon size={22} /></div>
        </div>
      </div>
    );
  };

  return (
    <div className={`h-full overflow-y-auto p-5 ${t.text}`} dir="rtl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-xl font-bold"><UserRound className="text-sky-500" /> داشبورد هوشمند سرویس‌کار</h1><p className={`mt-1 text-xs ${t.sub}`}>نمای یکپارچه عملکرد، ساعات، قطعات و کارهای جاری</p></div>
        <select value={selected} onChange={(e) => setSelected(e.target.value)} className={`min-w-60 rounded-xl border px-3 py-2 text-sm ${t.input}`}>
          <option>همه سرویس‌کاران</option>{names.map((name) => <option key={name}>{name}</option>)}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {card("سرویس‌های انجام‌شده", fa(records.length), Wrench, "bg-sky-500/15 text-sky-500")}
        {card("ساعات ثبت‌شده", `${fa(Math.floor(workMinutes / 60))}:${fa(String(workMinutes % 60).padStart(2, "0"))}`, Clock3, "bg-violet-500/15 text-violet-500")}
        {card("قطعات تحویل‌شده", fa(deliveredCount), PackageCheck, "bg-emerald-500/15 text-emerald-500")}
        {card("قطعات مصرف‌شده", fa(usedCount), Activity, "bg-rose-500/15 text-rose-500")}
      </div>

      {activeJob && <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-400/30 bg-blue-500/10 p-3 text-sm"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" /><b>در حال انجام:</b> {activeJob.buildingName}<span className={`text-xs ${t.sub}`}>از {new Date(activeJob.startedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span></div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className={`rounded-2xl border p-4 ${t.panel} ${t.border}`}>
          <h2 className="mb-5 flex items-center gap-2 font-bold"><TrendingUp size={18} className="text-sky-500" /> روند سرویس‌های ماهانه</h2>
          <div className="flex h-44 items-end justify-around gap-3 border-b pb-2">
            {monthStats.length ? monthStats.map(([month, count]) => <div key={month} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-xs font-bold text-sky-500">{fa(count)}</span><div className="w-full max-w-12 rounded-t-lg bg-gradient-to-t from-blue-600 to-sky-300" style={{ height: `${Math.max(12, count / maxMonth * 120)}px` }} /><span className={`text-[10px] ${t.sub}`}>{month}</span></div>) : <div className={`m-auto text-xs ${t.sub}`}>هنوز سرویس تکمیل‌شده‌ای ثبت نشده است</div>}
          </div>
        </section>

        <section className={`rounded-2xl border p-4 ${t.panel} ${t.border}`}>
          <h2 className="mb-3 font-bold">تحویل قطعه به سرویس‌کار</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            <select value={partName} onChange={(e) => setPartName(e.target.value)} className={`rounded-lg border p-2 text-xs ${t.input}`}>{parts.map((part) => <option key={part.id} value={part.name}>{part.name}</option>)}</select>
            <NumberStepper value={quantity} min={1} onChange={setQuantity} ariaLabel="تعداد قطعه تحویلی" className="w-full" />
            <button type="button" disabled={selected === "همه سرویس‌کاران"} onClick={() => { if (!partName || selected === "همه سرویس‌کاران") return; appStore.addTechnicianPartDelivery({ technicianName: selected, partName, quantity, usedQuantity: 0, remainingQuantity: quantity, deliveredAt: new Date().toLocaleDateString("fa-IR"), status: "active", note }); setNote(""); }} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Plus size={14} /> ثبت تحویل</button>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`mt-2 w-full rounded-lg border p-2 text-xs ${t.input}`} placeholder="توضیحات تحویل (اختیاری)" />
          <div className="mt-3 max-h-36 overflow-auto text-xs">{technicianDeliveries.map((item) => <div key={item.id} className={`flex items-center justify-between border-b py-2 ${t.border}`}><span><b>{item.technicianName}</b> — {item.partName}؛ تحویل {fa(item.quantity)}، مصرف {fa(item.usedQuantity)}, باقی‌مانده {fa(item.remainingQuantity)} {item.unit || "عدد"}</span><span className="flex items-center gap-2"><small className={t.sub}>{item.deliveredAt}</small><button onClick={() => appStore.removeTechnicianPartDelivery(item.id)} className="text-rose-500"><Trash2 size={13} /></button></span></div>)}</div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className={`rounded-2xl border p-4 ${t.panel} ${t.border}`}>
          <h2 className="mb-3 flex items-center gap-2 font-bold"><AlertTriangle size={18} className="text-amber-500" /> سرویس‌های طولانی و دلیل آن</h2>
          <div className="max-h-52 overflow-auto text-xs">
            {records.filter(({ month }) => month.serviceDurationReason).map(({ contract, month }) => (
              <div key={`${contract.id}-${month.id}`} className={`border-b py-3 ${t.border}`}>
                <div className="flex justify-between gap-2"><b>{contract.building.replace(/^\*\s*/, "")}</b><span className={t.sub}>{month.inTime || "—"} تا {month.outTime || "—"}</span></div>
                <p className="mt-1 text-amber-600">{month.serviceDurationReason}</p>
              </div>
            ))}
            {!records.some(({ month }) => month.serviceDurationReason) && <div className={`py-8 text-center ${t.sub}`}>موردی ثبت نشده است</div>}
          </div>
        </section>
        <section className={`rounded-2xl border p-4 ${t.panel} ${t.border}`}>
          <h2 className="mb-3 flex items-center gap-2 font-bold"><StopCircle size={18} className="text-rose-500" /> کنترل کارهای باز و فراموش‌شده</h2>
          <div className="space-y-2 text-xs">
            {active.map((item) => (
              <div key={`${item.contractId}-${item.monthId}`} className={`flex items-center justify-between rounded-lg border p-3 ${t.border}`}>
                <div><b>{item.buildingName}</b><div className={`mt-1 ${t.sub}`}>{item.technicianName} · شروع {new Date(item.startedAt).toLocaleString("fa-IR")}</div></div>
                <button type="button" title="پایان دستی کار فراموش‌شده" onClick={() => appStore.finishActiveService(item.contractId, item.monthId, item.technicianName)} className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 font-bold text-white"><StopCircle size={14} /> پایان دستی</button>
              </div>
            ))}
            {active.length === 0 && <div className={`py-8 text-center ${t.sub}`}>هیچ سرویس بازی وجود ندارد</div>}
          </div>
        </section>
      </div>

      <section className={`mt-4 overflow-hidden rounded-2xl border ${t.panel} ${t.border}`}>
        <div className="flex items-center justify-between border-b p-4"><b>تقسیم کارها و کارهای واگذارشده همه اشخاص</b><span className={`text-xs ${t.sub}`}>{fa(visibleAssignments.length)} مورد</span></div>
        <div className="max-h-80 overflow-auto"><table className="w-full text-xs"><thead className={t.head}><tr><th className="p-3 text-right">تاریخ</th><th className="p-3 text-right">ساختمان</th><th className="p-3 text-right">منطقه</th><th className="p-3 text-right">سرویس‌کار</th><th className="p-3 text-right">واگذارکننده</th><th className="p-3 text-right">وضعیت</th></tr></thead><tbody>{visibleAssignments.map(item=><tr key={item.id} className={`border-t ${t.border}`}><td className="p-3">{item.date}</td><td className="p-3 font-bold">{item.buildingName}</td><td className="p-3">{item.zone}</td><td className="p-3 text-blue-500">{item.technician}</td><td className="p-3">{item.assignedBy || "—"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.status === "done" ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>{item.status === "done" ? "انجام‌شده" : "باز"}</span></td></tr>)}</tbody></table>{!visibleAssignments.length&&<div className={`p-8 text-center text-xs ${t.sub}`}>تقسیم کاری ثبت نشده است</div>}</div>
      </section>

      <section className={`mt-4 rounded-2xl border p-4 ${t.panel} ${t.border}`}>
        <h2 className="mb-3 flex items-center gap-2 font-bold"><FileText size={18} className="text-indigo-500"/> گزارش‌های روزانه سرویس‌کاران</h2><div className="max-h-96 space-y-2 overflow-auto">{[...records].sort((a,b)=>(b.month.date||"").localeCompare(a.month.date||"")).map(({contract,month})=><div key={`${contract.id}-${month.id}`} className={`rounded-xl border p-3 ${t.border}`}><div className="flex flex-wrap items-center justify-between gap-2"><b>{contract.building.replace(/^\*\s*/,"")}</b><div className={`text-[11px] ${t.sub}`}>{month.date || `${month.m} ${month.y}`} · {month.doneBy || month.techs?.join("، ") || "—"}</div></div>{month.report&&<p className="mt-2 text-xs leading-6">{month.report}</p>}{month.partsList?.length?<div className="mt-2 rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-600">قطعات: {month.partsList.map(part=>`${part.name} × ${fa(part.qty)}`).join("، ")}</div>:null}<div className={`mt-2 text-[10px] ${t.sub}`}>ساعت {month.inTime||"—"} تا {month.outTime||"—"}</div></div>)}{!records.length&&<div className={`py-8 text-center text-xs ${t.sub}`}>گزارشی ثبت نشده است</div>}</div>
      </section>

      <section className={`mt-4 overflow-hidden rounded-2xl border ${t.panel} ${t.border}`}>
        <div className="border-b p-4 font-bold">ردیابی قطعات مصرف‌شده در سرویس‌ها و خرابی‌ها</div>
        <div className="overflow-auto"><table className="w-full text-xs"><thead className={t.head}><tr><th className="p-3 text-right">قطعه</th><th className="p-3 text-right">تعداد</th><th className="p-3 text-right">ساختمان</th><th className="p-3 text-right">تاریخ مصرف</th></tr></thead><tbody>{usedParts.map((part, index) => <tr key={`${part.name}-${index}`} className={`border-t ${t.border}`}><td className="p-3">{part.name}</td><td className="p-3">{fa(part.qty)} {part.unit}</td><td className="p-3">{part.building.replace(/^\*\s*/, "")}</td><td className="p-3">{part.date}</td></tr>)}</tbody></table>{usedParts.length === 0 && <div className={`p-8 text-center text-xs ${t.sub}`}>مصرف قطعه‌ای برای این سرویس‌کار ثبت نشده است</div>}</div>
      </section>
    </div>
  );
}

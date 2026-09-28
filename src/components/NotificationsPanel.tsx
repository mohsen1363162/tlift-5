import { useMemo,useState } from "react";
import { AlertTriangle,Bell,Check,Clock3,CreditCard,MessageSquare,X } from "lucide-react";
import type { AppNotification } from "../store";
import { appStore,useNotifications,useScheduledServices } from "../store";
import type { Theme } from "../theme";
type Tab="urgent"|"all"|"payment"|"breakdown"|"ticket"|"overdue";
const faToEn=(v:string)=>v.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^0-9]/g,"");
export default function NotificationsPanel({t,onClose,onOpenContract,onShowToast}:{t:Theme;onClose:()=>void;onOpenContract:(id:number)=>void;onShowToast:(m:string)=>void}){
  const notifications = useNotifications();
  const services = useScheduledServices();
  const [tab, setTab] = useState<Tab>("urgent");

  const visible = useMemo(() => {
    const currentTimestamp = Date.now();
    return notifications
      .filter(n => !n.snoozedUntil || n.snoozedUntil <= currentTimestamp)
      .map(n => ({
        ...n,
        priority: (n.priority || (n.type === "breakdown" ? "critical" : n.type === "payment" ? "high" : "normal")) as AppNotification["priority"]
      }))
      .sort((a,b) => {
        const order = { critical: 0, high: 1, normal: 2 };
        const pA = order[a.priority || "normal"];
        const pB = order[b.priority || "normal"];
        return pA !== pB ? pA - pB : b.createdAt - a.createdAt;
      });
  }, [notifications]);

  const overdue = useMemo(() => {
    const today = faToEn(new Date().toLocaleDateString("fa-IR-u-nu-latn"));
    return services.filter(s => {
      const date = faToEn(s.date || "");
      return s.status === "pending" && date.length >= 8 && date < today;
    });
  }, [services]);

  const filtered = useMemo(() => {
    if (tab === "all") return visible;
    if (tab === "urgent") return visible.filter(n => n.priority !== "normal" && n.actionStatus === "pending");
    if (tab === "overdue") return [];
    return visible.filter(n => n.type === tab);
  }, [tab, visible]);

  const icon = (n: AppNotification) =>
    n.type === "payment" ? <CreditCard size={17} /> : n.type === "ticket" ? <MessageSquare size={17} /> : <AlertTriangle size={17} />;

  const tabs: [Tab, string, number][] = [
    ["urgent", "فوری", visible.filter(n => n.priority !== "normal" && n.actionStatus === "pending").length],
    ["all", "همه", visible.length],
    ["payment", "پرداخت", visible.filter(n => n.type === "payment").length],
    ["breakdown", "خرابی", visible.filter(n => n.type === "breakdown").length],
    ["ticket", "تیکت", visible.filter(n => n.type === "ticket").length],
    ["overdue", "عقب‌افتاده", overdue.length]
  ];

  return (
    <div className="fixed inset-0 z-[85] bg-black/40" onClick={onClose}>
      <div dir="rtl" className={`absolute inset-x-3 bottom-3 top-16 mx-auto flex max-w-3xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${t.card} ${t.border}`} onClick={e => e.stopPropagation()}>
        <div className={`flex items-center justify-between border-b p-4 ${t.border}`}>
          <div className={`flex items-center gap-2 font-bold ${t.text}`}>
            <Bell size={19} className="text-amber-500" /> مرکز پیگیری اعلان‌ها <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] text-white">{notifications.filter(n => !n.read).length.toLocaleString("fa-IR")}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => appStore.markAllNotificationsRead()} className={`text-[10px] ${t.sub}`}>همه خوانده شد</button>
            <button onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b p-2">
          {tabs.map(([id, label, count]) => (
            <button key={id} onClick={() => setTab(id)} className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-bold ${tab === id ? "bg-blue-600 text-white" : "bg-gray-500/10"}`}>
              {label} {count > 0 && `(${count.toLocaleString("fa-IR")})`}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {tab === "overdue" ? (
            overdue.map(s => (
              <div key={s.id} className="mb-2 rounded-xl border border-amber-300 bg-amber-500/10 p-3">
                <div className="flex justify-between">
                  <b className="text-xs text-amber-700">سرویس عقب‌افتاده — {s.buildingName}</b>
                  <span className="text-[10px] text-amber-600">{s.date}</span>
                </div>
                <div className={`mt-2 text-[11px] ${t.sub}`}>{s.zone} · سرویس‌کار: {s.technician || "تخصیص‌نیافته"}</div>
                {s.contractId && (
                  <button onClick={() => { onOpenContract(s.contractId!); onClose(); }} className="mt-2 rounded-lg bg-amber-600 px-3 py-2 text-[10px] font-bold text-white">
                    بازکردن پرونده
                  </button>
                )}
              </div>
            ))
          ) : (
            filtered.map(item => (
              <div key={item.id} className={`mb-2 rounded-xl border p-3 ${item.priority === "critical" ? "border-red-400 bg-red-500/10" : item.priority === "high" ? "border-amber-300 bg-amber-500/10" : t.border}`}>
                <button onClick={() => { appStore.markNotificationRead(item.id); if (item.contractId) onOpenContract(item.contractId); onClose(); }} className="w-full text-right">
                  <div className="flex items-start gap-2">
                    <span className={item.priority === "critical" ? "text-red-500" : item.type === "payment" ? "text-emerald-500" : "text-blue-500"}>{icon(item)}</span>
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <b className={`text-xs ${t.text}`}>{item.title}</b>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] ${item.priority === "critical" ? "bg-red-500 text-white" : item.priority === "high" ? "bg-amber-500 text-white" : "bg-gray-500/20"}`}>
                          {item.priority === "critical" ? "فوری" : item.priority === "high" ? "مهم" : "عادی"}
                        </span>
                      </div>
                      <div className={`mt-1 text-[11px] leading-5 ${t.sub}`}>{item.message}</div>
                      <div className={`mt-1 text-[9px] ${t.sub}`}>{new Date(item.createdAt).toLocaleString("fa-IR")}</div>
                    </div>
                  </div>
                </button>
                {item.actionStatus === "pending" && (
                  <div className="mt-2 flex gap-2 border-t pt-2">
                    <button onClick={() => { appStore.resolveNotification(item.id, true); onShowToast(item.type === "payment" ? "پرداخت تأیید و در پرتال ثبت شد" : "مورد پیگیری و تأیید شد"); }} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-[10px] font-bold text-white">
                      <Check size={13} />{item.type === "payment" ? "تأیید پرداخت" : "انجام شد"}
                    </button>
                    {item.type === "payment" && (
                      <button onClick={() => appStore.resolveNotification(item.id, false)} className="rounded-lg border border-red-400 px-3 text-[10px] text-red-500">رد</button>
                    )}
                    <button onClick={() => { appStore.snoozeNotification(item.id); onShowToast("پیگیری تا ۲۴ ساعت به تعویق افتاد"); }} className="rounded-lg border px-3 text-[10px]">
                      <Clock3 size={12} className="ml-1 inline" />فردا
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          {((tab === "overdue" && !overdue.length) || (tab !== "overdue" && !filtered.length)) && (
            <div className={`py-16 text-center text-xs ${t.sub}`}>موردی در این بخش وجود ندارد.</div>
          )}
        </div>
      </div>
    </div>
  );
}

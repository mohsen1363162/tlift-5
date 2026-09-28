import { useState } from "react";
import { Printer, Save, X } from "lucide-react";
import type { Contract, ServiceContractDraft } from "../data";
import type { Theme } from "../theme";
import { appStore, useContracts } from "../store";
import { printServiceMaintenanceContract } from "../utils/printServiceContract";

const defaultDraft = (contract: Contract): ServiceContractDraft => ({
  customerName: contract.serviceContractDraft?.customerName || contract.customer || contract.manager || "",
  address: contract.serviceContractDraft?.address ?? contract.address ?? "",
  representative: contract.serviceContractDraft?.representative || "محسن امامی برسری",
  startDate: contract.serviceContractDraft?.startDate || contract.start || "",
  endDate: contract.serviceContractDraft?.endDate || contract.end || "",
  // مبلغ همیشه از آخرین مبلغ قرارداد/تمدید خوانده می‌شود، نه نسخه چاپی سال قبل.
  monthlyAmountToman: contract.monthlyServiceFee ? String(Math.round(contract.monthlyServiceFee / 10)) : (contract.serviceContractDraft?.monthlyAmountToman || ""),
  deviceCount: contract.serviceContractDraft?.deviceCount || "1",
  stops: contract.serviceContractDraft?.stops || "",
  doorType: contract.serviceContractDraft?.doorType || "",
  capacityPersons: contract.serviceContractDraft?.capacityPersons || "",
  capacityKg: contract.serviceContractDraft?.capacityKg || "",
  savedAt: contract.serviceContractDraft?.savedAt,
});

export default function ServiceContractPreviewModal({ contract, t, onClose, onShowToast }: { contract: Contract; t: Theme; onClose: () => void; onShowToast: (message: string) => void }) {
  const contracts = useContracts();
  const currentContract = contracts.find((item) => item.id === contract.id) || contract;
  const [draft, setDraft] = useState<ServiceContractDraft>(() => defaultDraft(currentContract));
  const set = (key: keyof ServiceContractDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    const saved = { ...draft, savedAt: Date.now() };
    setDraft(saved);
    appStore.updateContract({ ...currentContract, serviceContractDraft: saved });
    onShowToast("نسخه ویرایش‌شده قرارداد برای چاپ‌های بعدی ذخیره شد");
    return saved;
  };
  const print = () => {
    const saved = save();
    if (!printServiceMaintenanceContract(currentContract, saved)) onShowToast("مرورگر پنجره چاپ را مسدود کرد؛ Pop-up را برای این سایت مجاز کنید");
  };
  const fields: { key: keyof ServiceContractDraft; label: string; placeholder?: string; wide?: boolean }[] = [
    { key: "customerName", label: "نام کارفرما" },
    { key: "representative", label: "نماینده شرکت" },
    { key: "address", label: "آدرس قابل چاپ", placeholder: "قسمت‌های اضافی را همین‌جا پاک کنید", wide: true },
    { key: "startDate", label: "تاریخ شروع" }, { key: "endDate", label: "تاریخ پایان" },
    { key: "monthlyAmountToman", label: "مبلغ ماهیانه (تومان)" },
    { key: "deviceCount", label: "تعداد دستگاه" }, { key: "stops", label: "تعداد توقف" },
    { key: "doorType", label: "نوع درب" }, { key: "capacityPersons", label: "ظرفیت نفر" },
    { key: "capacityKg", label: "ظرفیت کیلوگرم" },
  ];
  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-3" onClick={onClose}>
    <div dir="rtl" className={`max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-2xl border p-5 shadow-2xl ${t.card} ${t.border}`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between"><div><h2 className={`text-base font-bold ${t.text}`}>پیش‌نمایش و ویرایش قرارداد سرویس و نگهداری</h2><p className={`mt-1 text-xs ${t.sub}`}>اطلاعات را قبل از چاپ اصلاح کنید. نسخه ذخیره‌شده سال بعد نیز باقی می‌ماند.</p></div><button type="button" onClick={onClose} className={`rounded-lg p-2 ${t.hover}`}><X size={18}/></button></div>
      {draft.savedAt && <div className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-500">نسخه قبلی در {new Date(draft.savedAt).toLocaleString("fa-IR")} ذخیره شده است.</div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map((field) => <label key={field.key} className={field.wide ? "sm:col-span-2" : ""}><span className={`mb-1 block text-xs ${t.sub}`}>{field.label}</span>{field.wide ? <textarea value={String(draft[field.key] || "")} onChange={(e) => set(field.key, e.target.value)} placeholder={field.placeholder} className={`min-h-20 w-full rounded-xl border p-3 text-sm outline-none focus:border-blue-500 ${t.input} ${t.border}`}/> : <input value={String(draft[field.key] || "")} onChange={(e) => set(field.key, e.target.value)} placeholder={field.placeholder} className={`h-11 w-full rounded-xl border px-3 text-sm outline-none focus:border-blue-500 ${t.input} ${t.border}`}/>}</label>)}</div>
      <div className={`mt-4 rounded-xl border p-4 text-xs leading-7 ${t.border} ${t.text}`}><b>خلاصه پیش‌نمایش:</b> قرارداد شماره {contract.no} برای {draft.customerName || "کارفرما"}، به آدرس «{draft.address || "بدون آدرس"}»، از تاریخ {draft.startDate || "—"} تا {draft.endDate || "—"} با مبلغ ماهیانه {draft.monthlyAmountToman || "—"} تومان چاپ خواهد شد.</div>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={save} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"><Save size={17}/> ذخیره بدون چاپ</button><button type="button" onClick={print} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white"><Printer size={17}/> ذخیره و نمایش نسخه چاپی</button><button type="button" onClick={onClose} className={`rounded-xl border px-5 py-3 text-sm ${t.border}`}>انصراف</button></div>
    </div>
  </div>;
}

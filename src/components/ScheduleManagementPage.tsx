import { useState, useMemo } from "react";
import {
  Calendar,
  MoreVertical,
  Printer,
  Bell,
  Wrench,
  Eye,
  FileText,
  Clock,
  UserCheck,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Check,
  X,
  Plus,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Send,
  Building,
  User,
  MapPin,
  FileCheck,
  AlertCircle,
  AlertTriangle,
  SlidersHorizontal,
  HelpCircle,
  Info,
  CalendarRange,
} from "lucide-react";
import { ScheduledService, appStore, useScheduledServices, useStaff, useZones, useContracts, normalizeServiceJalaliDate } from "../store";
import { Theme } from "../theme";
import ServiceForm from "../ServiceForm";
import ContractRibbonBar from "./ContractRibbonBar";
import BreakdownModal from "./BreakdownModal";

const JALALI_MONTH_OPTIONS = [
  { num: "01", name: "فروردین" },
  { num: "02", name: "اردیبهشت" },
  { num: "03", name: "خرداد" },
  { num: "04", name: "تیر" },
  { num: "05", name: "مرداد" },
  { num: "06", name: "شهریور" },
  { num: "07", name: "مهر" },
  { num: "08", name: "آبان" },
  { num: "09", name: "آذر" },
  { num: "10", name: "دی" },
  { num: "11", name: "بهمن" },
  { num: "12", name: "اسفند" },
];

interface ScheduleManagementPageProps {
  t: Theme;
  onOpenContract?: (contractNo: string) => void;
  onShowToast?: (msg: string) => void;
}

export default function ScheduleManagementPage({
  t,
  onOpenContract,
  onShowToast,
}: ScheduleManagementPageProps) {
  const services = useScheduledServices();
  const staffList = useStaff();
  const registeredZones = useZones();
  const contracts = useContracts();

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>("1405/06");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dayPreset, setDayPreset] = useState<string>("all");
  const [showPendingInfo, setShowPendingInfo] = useState<boolean>(false);
  const [selectedStatus, setSelectedStatus] = useState<"all" | "done" | "pending">("all");
  const [selectedTech, setSelectedTech] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // UI state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  // Modals
  const [modalType, setModalType] = useState<
    | null
    | "checklist"
    | "reminder"
    | "partRequest"
    | "viewParts"
    | "report"
    | "changeDate"
    | "changeTech"
    | "newService"
  >(null);
  const [targetService, setTargetService] = useState<ScheduledService | null>(null);
  const [reportService, setReportService] = useState<ScheduledService | null>(null);
  const [breakdownService, setBreakdownService] = useState<ScheduledService | null>(null);

  // Form states for modals
  const [newDateInput, setNewDateInput] = useState("");
  const [newTechInput, setNewTechInput] = useState("");
  const [reportInput, setReportInput] = useState("");
  const [partNameInput, setPartNameInput] = useState("");
  const [partQtyInput, setPartQtyInput] = useState("1");
  const [partReasonInput, setPartReasonInput] = useState("");

  // New service form state
  const [newBuilding, setNewBuilding] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [newContractNo, setNewContractNo] = useState("");
  const [newZone, setNewZone] = useState("امام سجاد قزوین - البرز");
  const [newServiceTech, setNewServiceTech] = useState("میثم سهرابی");
  const [newServiceDate, setNewServiceDate] = useState("1405-06-01");

  // Checklist demo items for target service
  const [checklistItems, setChecklistItems] = useState([
    { id: 1, text: "بررسی لقی و رگلاژ کفشک‌های ریل کابین و قاب وزنه", checked: true },
    { id: 2, text: "بررسی و نظافت ترمز، فاصله مگنت و ضخامت لنت‌ها", checked: true },
    { id: 3, text: "بررسی سطح روغن موتور، گیربکس و روانکاری ریل‌ها", checked: true },
    { id: 4, text: "بررسی سنسورهای دورانداز، حد و استپ اضطراری چاهک", checked: false },
    { id: 5, text: "کنترل روشنایی کابین، سیستم مخابره و زنگ اضطراری", checked: true },
    { id: 6, text: "تست قفل درب طبقات و کمان درب بازکن کابین", checked: false },
    { id: 7, text: "بررسی وضعیت سیم بکسل‌ها و فلکه هرزگرد", checked: false },
  ]);

  // Derived filter options
  const allTechs = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => s.technician && set.add(s.technician));
    staffList.forEach((st) => set.add(`${st.first} ${st.last}`));
    return Array.from(set);
  }, [services, staffList]);

  const allCustomers = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => s.customerName && set.add(s.customerName));
    return Array.from(set);
  }, [services]);

  const allZones = useMemo(() => {
    const set = new Set<string>();
    registeredZones.forEach((z) => set.add(z.name));
    services.forEach((s) => s.zone && set.add(s.zone));
    return Array.from(set);
  }, [services, registeredZones]);

  const monthCounts = useMemo(() => {
    let s06 = 0;
    let s07 = 0;
    services.forEach((s) => {
      const norm = normalizeServiceJalaliDate(s.date);
      if (norm.startsWith("1405/06")) s06++;
      if (norm.startsWith("1405/07")) s07++;
    });
    return { "1405/06": s06, "1405/07": s07 };
  }, [services]);

  const toFaDigits = (n: number | string) => Number(n || 0).toLocaleString("fa-IR");

  // Filtered services
  const filteredServices = useMemo(() => {
    const normStart = startDate ? normalizeServiceJalaliDate(startDate) : "";
    const normEnd = endDate ? normalizeServiceJalaliDate(endDate) : "";

    return services.filter((s) => {
      const normDate = normalizeServiceJalaliDate(s.date);

      // 1. Explicit start date filter
      if (normStart && normDate < normStart) return false;

      // 2. Explicit end date filter
      if (normEnd && normDate > normEnd) return false;

      // 3. Month filter (if neither start nor end date is set)
      if (!normStart && !normEnd && selectedMonth !== "all") {
        if (!normDate.startsWith(selectedMonth)) return false;
      }

      // Status filter
      if (selectedStatus !== "all" && s.status !== selectedStatus) return false;
      // Tech filter
      if (selectedTech !== "all" && s.technician !== selectedTech) return false;
      // Customer filter
      if (selectedCustomer !== "all" && s.customerName !== selectedCustomer) return false;
      // Zone filter
      if (selectedZone !== "all" && s.zone !== selectedZone) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          s.buildingName.toLowerCase().includes(q) ||
          s.customerName.toLowerCase().includes(q) ||
          s.contractNo.toLowerCase().includes(q) ||
          s.zone.toLowerCase().includes(q) ||
          s.technician.toLowerCase().includes(q) ||
          (s.report && s.report.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [services, selectedMonth, startDate, endDate, selectedStatus, selectedTech, selectedCustomer, selectedZone, searchQuery]);

  // Group services by date
  const groupedByDay = useMemo(() => {
    const map: Record<string, ScheduledService[]> = {};

    // Group dates with normalized format
    filteredServices.forEach((s) => {
      const day = normalizeServiceJalaliDate(s.date) || s.date;
      if (!map[day]) map[day] = [];
      map[day].push(s);
    });

    // If explicit start and end date are provided within the same month, ensure every day has a column:
    const sNorm = startDate ? normalizeServiceJalaliDate(startDate) : "";
    const eNorm = endDate ? normalizeServiceJalaliDate(endDate) : "";
    if (sNorm && eNorm && sNorm <= eNorm) {
      const sParts = sNorm.split("/").map(Number);
      const eParts = eNorm.split("/").map(Number);
      if (sParts[0] === eParts[0] && sParts[1] === eParts[1] && eParts[2] >= sParts[2] && eParts[2] - sParts[2] <= 31) {
        for (let d = sParts[2]; d <= eParts[2]; d++) {
          const dStr = `${sParts[0]}/${String(sParts[1]).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
          if (!map[dStr]) map[dStr] = [];
        }
      }
    }

    // CRITICAL USER REQUIREMENT:
    // "هر کدوم از سرویسها که انجام میشن کنارش انجام شد زده میشه و انجام نشدهها به سمت بالا میان تا من ببینم و انجام بدم."
    // In each column: Pending ("pending") items sort to the TOP (0), Done ("done") items sort to the BOTTOM (1)
    const result: Record<string, ScheduledService[]> = {};
    const sortedDates = Object.keys(map).sort();

    sortedDates.forEach((date) => {
      const items = [...map[date]];
      items.sort((a, b) => {
        if (a.status === "pending" && b.status === "done") return -1;
        if (a.status === "done" && b.status === "pending") return 1;
        return (b.lastUpdated || 0) - (a.lastUpdated || 0);
      });
      result[date] = items;
    });

    return result;
  }, [filteredServices, startDate, endDate]);

  // Quick stats
  const totalCount = filteredServices.length;
  const doneCount = filteredServices.filter((s) => s.status === "done").length;
  const pendingCount = filteredServices.filter((s) => s.status === "pending").length;

  const handleToggleStatus = (s: ScheduledService, e?: React.MouseEvent) => {
    e?.stopPropagation();
    appStore.toggleScheduledServiceStatus(s.id);
    const newStatus = s.status === "done" ? "انجام نشده" : "انجام شده";
    onShowToast?.(`وضعیت «${s.buildingName}» به «${newStatus}» تغییر یافت.`);
  };

  const handleOpenMenu = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId((curr) => (curr === id ? null : id));
  };

  const handleDaySelectAll = (date: string) => {
    const dayItems = groupedByDay[date] || [];
    const dayItemIds = dayItems.map((it) => it.id);
    const allSelected = dayItemIds.every((id) => selectedServices.includes(id));

    if (allSelected) {
      setSelectedServices((curr) => curr.filter((id) => !dayItemIds.includes(id)));
      setSelectedDays((curr) => curr.filter((d) => d !== date));
    } else {
      setSelectedServices((curr) => Array.from(new Set([...curr, ...dayItemIds])));
      setSelectedDays((curr) => (curr.includes(date) ? curr : [...curr, date]));
    }
  };

  const handleBatchToggleDone = () => {
    if (selectedServices.length === 0) return;
    selectedServices.forEach((id) => {
      const item = services.find((s) => s.id === id);
      if (item && item.status !== "done") {
        appStore.toggleScheduledServiceStatus(id);
      }
    });
    onShowToast?.(`${selectedServices.length} سرویس به وضعیت «انجام شده» تغییر یافت.`);
    setSelectedServices([]);
  };

  const handleOpenModal = (
    type: typeof modalType,
    service: ScheduledService,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    setActiveMenuId(null);
    setTargetService(service);
    setModalType(type);

    if (type === "changeDate") setNewDateInput(service.date);
    if (type === "changeTech") setNewTechInput(service.technician);
    if (type === "report") setReportInput(service.report || "");
    if (type === "partRequest") {
      setPartNameInput("");
      setPartQtyInput("1");
      setPartReasonInput("");
    }
  };

  const handleSaveDate = () => {
    if (!targetService || !newDateInput.trim()) return;
    appStore.updateScheduledServiceDate(targetService.id, newDateInput.trim());
    onShowToast?.(`تاریخ سرویس «${targetService.buildingName}» به «${newDateInput}» منتقل شد.`);
    setModalType(null);
  };

  const handleSaveTech = () => {
    if (!targetService || !newTechInput.trim()) return;
    appStore.updateScheduledServiceTechnician(targetService.id, newTechInput.trim());
    onShowToast?.(`سرویسکار «${targetService.buildingName}» به «${newTechInput}» تغییر یافت.`);
    setModalType(null);
  };

  const handleSaveReport = () => {
    if (!targetService || !reportInput.trim()) return;
    appStore.addScheduledServiceReport(targetService.id, reportInput.trim());
    onShowToast?.(`گزارش سرویس «${targetService.buildingName}» ثبت و سرویس انجام شد.`);
    setModalType(null);
  };

  const handleSavePartRequest = () => {
    if (!targetService || !partNameInput.trim()) return;
    appStore.addScheduledServicePartRequest(targetService.id, {
      name: partNameInput.trim(),
      qty: parseInt(partQtyInput, 10) || 1,
      reason: partReasonInput.trim() || "نیاز به تعویض در سرویس دوره‌ای",
    });
    onShowToast?.(`درخواست قطعه «${partNameInput}» برای «${targetService.buildingName}» ثبت شد.`);
    setModalType(null);
  };

  const handleCreateNewService = () => {
    if (!newBuilding.trim()) return;
    appStore.addScheduledService({
      date: newServiceDate,
      buildingName: newBuilding.trim(),
      customerName: newCustomer.trim() || newBuilding.trim(),
      contractNo: newContractNo.trim() || "5000",
      zone: newZone,
      technician: newServiceTech,
      techCount: 5,
      status: "pending",
    });
    onShowToast?.(`سرویس جدید برای «${newBuilding}» در تاریخ ${newServiceDate} ایجاد شد.`);
    setModalType(null);
    setNewBuilding("");
    setNewCustomer("");
    setNewContractNo("");
  };

  if (reportService) {
    const allContracts = appStore.getContracts();
    const matchingContract = allContracts.find((c) => c.no === reportService.contractNo);
    return (
      <div className="flex h-full flex-col">
        <ServiceForm
          t={t}
          planDate={reportService.scheduledDate || "1405/07/13"}
          baseAmount={7000000}
          contractRibbon={
            <ContractRibbonBar
              t={t}
              contract={matchingContract}
              contractNo={reportService.contractNo}
              buildingName={reportService.buildingName}
              managerName={reportService.customerName}
              totalPayable={14000000}
              totalPaid={14000000}
              debt={0}
              buildingDebt={0}
              customerDebt={0}
            />
          }
          initialData={{
            doneBy: reportService.technician || "محسن امامی برسری",
            report: reportService.report || "",
            doneDate: reportService.actualDate || "1405/06/25",
            inTime: "10:00",
            outTime: "11:30",
            wage: 0,
            trip: 0,
            discount: 0,
            faultsList: [],
            partsList:
              reportService.partsRequested?.map((p, idx) => ({
                code: `PRT-${idx + 101}`,
                name: p.name,
                unit: "عدد",
                qty: p.qty || 1,
                price: 0,
              })) || [],
          }}
          onBack={() => setReportService(null)}
          onSubmit={(d) => {
            appStore.updateScheduledService(reportService.id, {
              status: "done",
              report: d.report,
              technician: d.doneBy,
              actualDate: d.doneDate,
              partsUsed: d.partsList.map((p) => p.name),
            });
            if (matchingContract) {
              const cDetails = appStore.getContractDetails(matchingContract.id);
              const mMatch = cDetails.months.find((m) => !m.done) || cDetails.months[0];
              if (mMatch) {
                appStore.addServiceSubmission(matchingContract.id, mMatch.id, d);
              }
            }
            setReportService(null);
            onShowToast?.("گزارش سرویس با موفقیت ثبت و ذخیره شد");
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden text-right select-none ${t.body}`}
      dir="rtl"
      onClick={() => setActiveMenuId(null)}
    >
      {/* Top Filter & Toolbar */}
      <div
        className={`flex flex-col gap-2 border-b p-2.5 text-[12px] ${t.chrome} ${t.border} shadow-sm`}
      >
        {/* Row 1: Date Range, Month selection, Quick Presets & Counters */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Right: Date range selection & quick presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Label */}
            <div className="flex items-center gap-1 text-[11.5px] font-semibold text-zinc-300 ml-1">
              <CalendarRange size={13} className="text-amber-400" />
              <span>تقویم و بازه تاریخ:</span>
            </div>

            {/* Month Buttons: شهریور ۱۴۰۵, مهر ۱۴۰۵, همه ماه‌ها, سایر ماه‌ها */}
            <div className="flex items-center gap-1 rounded bg-black/30 border border-zinc-700/60 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth("1405/06");
                  setStartDate("");
                  setEndDate("");
                  setDayPreset("all");
                }}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-bold transition cursor-pointer ${
                  selectedMonth === "1405/06" && !startDate && !endDate
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                <span>شهریور ۱۴۰۵</span>
                {monthCounts["1405/06"] > 0 && (
                  <span
                    className={`rounded px-1 text-[10px] ${
                      selectedMonth === "1405/06" && !startDate && !endDate
                        ? "bg-black/20 text-black"
                        : "bg-zinc-800 text-amber-400"
                    }`}
                  >
                    ({toFaDigits(monthCounts["1405/06"])})
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth("1405/07");
                  setStartDate("");
                  setEndDate("");
                  setDayPreset("all");
                }}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 font-bold transition cursor-pointer ${
                  selectedMonth === "1405/07" && !startDate && !endDate
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-zinc-300 hover:text-white"
                }`}
              >
                <span>مهر ۱۴۰۵</span>
                {monthCounts["1405/07"] > 0 && (
                  <span
                    className={`rounded px-1 text-[10px] ${
                      selectedMonth === "1405/07" && !startDate && !endDate
                        ? "bg-black/20 text-black"
                        : "bg-zinc-800 text-amber-400"
                    }`}
                  >
                    ({toFaDigits(monthCounts["1405/07"])})
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth("all");
                  setStartDate("");
                  setEndDate("");
                  setDayPreset("all");
                }}
                className={`rounded px-2.5 py-1 font-bold transition cursor-pointer ${
                  selectedMonth === "all" && !startDate && !endDate
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                همه ماه‌ها
              </button>

              {/* Month selector dropdown for any month/year */}
              <select
                value={selectedMonth.startsWith("140") ? selectedMonth : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    setSelectedMonth(val);
                    setStartDate("");
                    setEndDate("");
                    setDayPreset("all");
                  }
                }}
                className="bg-transparent text-[11px] text-zinc-300 px-1 py-0.5 outline-none cursor-pointer border-r border-zinc-700 mr-1"
                title="انتخاب سایر ماه‌ها و سال‌ها"
              >
                <option value="" disabled className="bg-zinc-800 text-zinc-400">سایر ماه‌ها...</option>
                {["1405", "1404", "1406"].flatMap((y) =>
                  JALALI_MONTH_OPTIONS.map((m) => (
                    <option key={`${y}/${m.num}`} value={`${y}/${m.num}`} className="bg-zinc-800 text-zinc-200">
                      {m.name} {y}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Separator */}
            <span className="text-zinc-600 hidden sm:inline">|</span>

            {/* Custom Date Range: "از تاریخ" تا "تا تاریخ" */}
            <div className="flex items-center gap-1 bg-black/40 border border-zinc-700/70 rounded px-2 py-0.5 text-[11px]">
              <span className="text-zinc-400 font-medium">از:</span>
              <input
                type="text"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDayPreset("custom");
                }}
                placeholder="۱۴۰۵/۰۶/۰۱"
                className="w-20 bg-transparent text-center text-zinc-100 font-mono outline-none border-b border-transparent focus:border-amber-400 placeholder:text-zinc-600 text-[11px]"
                dir="ltr"
              />
              <span className="text-zinc-500">تا:</span>
              <input
                type="text"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDayPreset("custom");
                }}
                placeholder="۱۴۰۵/۰۶/۰۶"
                className="w-20 bg-transparent text-center text-zinc-100 font-mono outline-none border-b border-transparent focus:border-amber-400 placeholder:text-zinc-600 text-[11px]"
                dir="ltr"
              />
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                    setDayPreset("all");
                  }}
                  className="text-zinc-400 hover:text-red-400 p-0.5 transition cursor-pointer"
                  title="پاک کردن بازه تاریخ"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Quick Day Presets */}
            <div className="flex items-center gap-1 rounded bg-black/25 border border-zinc-700/60 p-0.5 text-[10.5px]">
              <span className="text-[10px] text-zinc-400 px-1 font-medium hidden md:inline">انتخاب روز:</span>
              <button
                type="button"
                onClick={() => {
                  const m = selectedMonth === "all" ? "1405/06" : selectedMonth;
                  setStartDate(`${m}/01`);
                  setEndDate(`${m}/06`);
                  setDayPreset("1-6");
                }}
                className={`rounded px-2 py-0.5 font-bold transition cursor-pointer ${
                  dayPreset === "1-6"
                    ? "bg-amber-500 text-black shadow-sm"
                    : "text-amber-400 hover:bg-zinc-800"
                }`}
                title="نمایش فقط روزهای ۱ تا ۶ ماه انتخابی"
              >
                ⚡ ۱ تا ۶ ماه
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = selectedMonth === "all" ? "1405/06" : selectedMonth;
                  setStartDate(`${m}/01`);
                  setEndDate(`${m}/15`);
                  setDayPreset("1-15");
                }}
                className={`rounded px-1.5 py-0.5 transition cursor-pointer ${
                  dayPreset === "1-15"
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                ۱ تا ۱۵
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = selectedMonth === "all" ? "1405/06" : selectedMonth;
                  setStartDate(`${m}/16`);
                  setEndDate(`${m}/30`);
                  setDayPreset("16-end");
                }}
                className={`rounded px-1.5 py-0.5 transition cursor-pointer ${
                  dayPreset === "16-end"
                    ? "bg-amber-500 text-black font-bold shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                ۱۶ تا ۳۰
              </button>
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setDayPreset("all");
                }}
                className={`rounded px-1.5 py-0.5 transition cursor-pointer ${
                  dayPreset === "all" && !startDate && !endDate
                    ? "bg-zinc-700 text-white font-bold"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                کل ماه
              </button>
            </div>
          </div>

          {/* Left: Summary Counter Badge & Actions */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded bg-black/30 border border-zinc-700/60 px-2.5 py-1 text-[11.5px] text-zinc-300 font-medium">
              <span className="text-amber-400 font-bold">{totalCount}</span>
              <span>مورد در این بازه</span>
              <span className="text-zinc-600">|</span>
              <button
                type="button"
                onClick={() => setSelectedStatus("done")}
                className={`font-bold transition hover:underline cursor-pointer ${selectedStatus === "done" ? "text-emerald-300 underline" : "text-emerald-400"}`}
              >
                {doneCount} انجام شده
              </button>
              <span className="text-zinc-600">|</span>
              <button
                type="button"
                onClick={() => setShowPendingInfo(true)}
                className="flex items-center gap-1 text-red-400 font-bold hover:underline cursor-pointer group"
                title="برای مشاهده توضیح کامل کلیک کنید"
              >
                <span className={selectedStatus === "pending" ? "underline text-red-300" : ""}>{pendingCount} در انتظار</span>
                <HelpCircle size={12} className="text-red-400/80 group-hover:text-red-200" />
              </button>
            </div>

            {/* Batch done action */}
            {selectedServices.length > 0 && (
              <button
                type="button"
                onClick={handleBatchToggleDone}
                className="flex items-center gap-1 rounded bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 text-[11.5px] font-medium text-white transition shadow-sm cursor-pointer"
              >
                <CheckCircle2 size={12} />
                <span>ثبت انجام {selectedServices.length} مورد</span>
              </button>
            )}

            {/* Add New Service Visit Button */}
            <button
              type="button"
              onClick={() => setModalType("newService")}
              className="flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-500 px-2.5 py-1 text-[11.5px] font-bold text-black transition shadow-sm cursor-pointer"
            >
              <Plus size={13} />
              <span>ثبت سرویس جدید</span>
            </button>
          </div>
        </div>

        {/* Row 2: Status Tabs, Technician, Customer, Zone & Search Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-zinc-800/80">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status selector tabs */}
            <div className="flex items-center gap-1 rounded bg-black/30 border border-zinc-700/60 p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedStatus("all")}
                className={`flex items-center gap-1 rounded px-2.5 py-0.5 font-medium transition cursor-pointer ${
                  selectedStatus === "all"
                    ? "bg-zinc-700 text-white shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <span>همه</span>
                <span className="font-bold text-amber-400">({totalCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("done")}
                className={`flex items-center gap-1 rounded px-2.5 py-0.5 font-medium transition cursor-pointer ${
                  selectedStatus === "done"
                    ? "bg-emerald-900/80 text-emerald-200 border border-emerald-600/50 shadow-sm"
                    : "text-zinc-400 hover:text-emerald-400"
                }`}
              >
                <CheckCircle2 size={11} className="text-emerald-400" />
                <span>انجام شده</span>
                <span className="font-bold text-emerald-400">({doneCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedStatus("pending")}
                className={`flex items-center gap-1 rounded px-2.5 py-0.5 font-medium transition cursor-pointer ${
                  selectedStatus === "pending"
                    ? "bg-red-950/80 text-red-200 border border-red-600/50 shadow-sm"
                    : "text-zinc-400 hover:text-red-400"
                }`}
                title="سرویس‌هایی که هنوز توسط سرویس‌کار انجام نشده و در نوبت هستند"
              >
                <Clock size={11} className="text-red-400" />
                <span>در انتظار سرویس</span>
                <span className="font-bold text-red-400">({pendingCount})</span>
              </button>
            </div>

            {/* Technician Dropdown */}
            <div className="relative">
              <select
                value={selectedTech}
                onChange={(e) => setSelectedTech(e.target.value)}
                className={`h-7 rounded border px-2.5 text-[11.5px] outline-none ${t.input} cursor-pointer`}
              >
                <option value="all">همه سرویسکاران</option>
                {allTechs.map((tch) => (
                  <option key={tch} value={tch}>
                    {tch}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Dropdown */}
            <div className="relative">
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className={`h-7 rounded border px-2.5 text-[11.5px] outline-none ${t.input} cursor-pointer`}
              >
                <option value="all">همه مشتریان</option>
                {allCustomers.map((cust) => (
                  <option key={cust} value={cust}>
                    {cust}
                  </option>
                ))}
              </select>
            </div>

            {/* Zone Dropdown */}
            <div className="relative">
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className={`h-7 rounded border px-2.5 text-[11.5px] outline-none ${t.input} cursor-pointer`}
              >
                <option value="all">همه منطقه‌ها</option>
                {allZones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            {/* Search query */}
            <div className={`flex h-7 items-center gap-1.5 rounded border px-2 ${t.input}`}>
              <Search size={12} className={t.sub} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجو در نام، قرارداد، مشتری..."
                className="w-36 bg-transparent text-[11px] outline-none placeholder:text-zinc-500"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery("")}>
                  <X size={11} className="text-zinc-400" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Info & Refresh */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPendingInfo(true)}
              className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-amber-400 transition cursor-pointer"
            >
              <Info size={12} />
              <span>راهنمای وضعیت «در انتظار»</span>
            </button>
            <button
              type="button"
              onClick={() => onShowToast?.("فیلترها با موفقیت اعمال شدند.")}
              className={`flex items-center gap-1 rounded border px-3 py-1 text-[11.5px] font-medium transition ${t.input} ${t.hover} cursor-pointer`}
            >
              <Filter size={12} className="text-amber-400" />
              <span>اعمال تغییر</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Kanban Columns Scroll Area (Matching sshot-46.png) */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3 bg-neutral-950/40">
        <div className="flex h-full gap-3 min-w-max pb-1">
          {Object.entries(groupedByDay).map(([dayDate, dayItems]) => {
            const isDayAllSelected =
              dayItems.length > 0 &&
              dayItems.every((it) => selectedServices.includes(it.id));
            const dayDoneCount = dayItems.filter((i) => i.status === "done").length;
            const dayPendingCount = dayItems.filter((i) => i.status === "pending").length;

            return (
              <div
                key={dayDate}
                className={`flex h-full w-[275px] flex-col rounded-lg border ${
                  t.border
                } bg-[#1f2023]/90 shadow-md backdrop-blur-sm overflow-hidden`}
              >
                {/* Day Header */}
                <div
                  className={`flex items-center justify-between border-b px-2.5 py-2 ${
                    t.border
                  } bg-[#28292d]`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isDayAllSelected}
                      onChange={() => handleDaySelectAll(dayDate)}
                      className="h-3.5 w-3.5 rounded border-zinc-600 accent-amber-500 cursor-pointer"
                      title="انتخاب همه سرویس‌های این روز"
                    />
                    <span className="text-[12.5px] font-bold text-zinc-100 tracking-wide">
                      {dayDate}
                    </span>
                    <Calendar size={14} className="text-zinc-400" />
                  </div>

                  <div className="flex items-center gap-1.5 text-[10.5px]">
                    <span className="rounded bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-zinc-300">
                      {dayItems.length} سرویس
                    </span>
                    {dayDoneCount > 0 && (
                      <span className="rounded bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 text-emerald-300 font-bold">
                        {dayDoneCount} انجام شد
                      </span>
                    )}
                    {dayPendingCount > 0 && (
                      <span className="rounded bg-red-500/20 border border-red-500/30 px-1.5 py-0.5 text-red-300 font-bold">
                        {dayPendingCount} مانده
                      </span>
                    )}
                  </div>
                </div>

                {/* Day Items List (Sorted with Pending on TOP, Done on BOTTOM) */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 divide-y-0">
                  {dayItems.length === 0 ? (
                    <div className="flex h-32 flex-col items-center justify-center text-center text-[11.5px] text-zinc-500">
                      <Calendar size={20} className="mb-1 opacity-40 text-zinc-400" />
                      <span>هیچ سرویسی برای این روز ثبت نشده است.</span>
                    </div>
                  ) : (
                    dayItems.map((service) => {
                      const isSelected = selectedServices.includes(service.id);
                      const isMenuOpen = activeMenuId === service.id;
                      const isDone = service.status === "done";

                      return (
                        <div
                          key={service.id}
                          className={`group relative rounded-md border p-2.5 text-[11.5px] transition-all duration-200 ${
                            isDone
                              ? "bg-[#25282a]/80 border-emerald-900/40 text-zinc-300 opacity-85 hover:opacity-100"
                              : "bg-[#2c2f34] border-zinc-700/80 text-zinc-100 shadow-sm hover:border-amber-500/50"
                          } ${isSelected ? "ring-1 ring-amber-400" : ""}`}
                        >
                          {/* Card Top Row: 3-dots, checkbox, Building Title */}
                          <div className="flex items-start justify-between gap-1.5 mb-1.5">
                            {/* Building Name */}
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <Building
                                size={13}
                                className={isDone ? "text-emerald-400" : "text-amber-400"}
                              />
                              <h4 className="truncate font-bold text-[12.5px] text-white">
                                {service.buildingName}
                              </h4>
                            </div>

                            {/* Actions on card header */}
                            <div className="flex items-center gap-1 shrink-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setSelectedServices((curr) =>
                                    curr.includes(service.id)
                                      ? curr.filter((x) => x !== service.id)
                                      : [...curr, service.id]
                                  );
                                }}
                                className="h-3.5 w-3.5 rounded border-zinc-600 accent-amber-500 cursor-pointer"
                              />

                              {/* 3-dots Menu Button */}
                              <button
                                type="button"
                                onClick={(e) => handleOpenMenu(service.id, e)}
                                title="عملیات سرویس"
                                className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100 transition"
                              >
                                <MoreVertical size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Context Menu Dropdown (Matching sshot-47.png exactly) */}
                          {isMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute left-2 top-8 z-50 w-48 rounded-lg border border-zinc-700 bg-[#222428] py-1 text-[11.5px] text-zinc-200 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                            >
                              <button
                                type="button"
                                onClick={(e) => handleOpenModal("checklist", service, e)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <Printer size={13} className="text-zinc-400 shrink-0" />
                                <span>چاپ چک لیست</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleOpenModal("reminder", service, e)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <Bell size={13} className="text-amber-400 shrink-0" />
                                <span>یادآوری سرویس</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleOpenModal("partRequest", service, e)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <Wrench size={13} className="text-orange-400 shrink-0" />
                                <span>ثبت درخواست قطعه</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleOpenModal("viewParts", service, e)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <Eye size={13} className="text-blue-400 shrink-0" />
                                <span>مشاهده درخواست قطعه</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(null);
                                  setReportService(service);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <FileText size={13} className="text-emerald-400 shrink-0" />
                                <span>ثبت گزارش</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuId(null);
                                  setBreakdownService(service);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <AlertTriangle size={13} className="text-amber-400 shrink-0" />
                                <span>ثبت خرابی</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleOpenModal("changeDate", service, e)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <Clock size={13} className="text-sky-400 shrink-0" />
                                <span>تغییر تاریخ</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleOpenModal("changeTech", service, e)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-zinc-700/70 text-right transition"
                              >
                                <UserCheck size={13} className="text-purple-400 shrink-0" />
                                <span>تغییر سرویسکار</span>
                              </button>

                              <div className="my-1 border-t border-zinc-700/60" />

                              {/* Direct toggle status */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  handleToggleStatus(service, e);
                                  setActiveMenuId(null);
                                }}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 font-medium transition ${
                                  isDone
                                    ? "text-red-400 hover:bg-red-500/10"
                                    : "text-emerald-400 hover:bg-emerald-500/10"
                                }`}
                              >
                                {isDone ? (
                                  <>
                                    <XCircle size={13} />
                                    <span>علامت به عنوان انجام نشده</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={13} />
                                    <span>علامت به عنوان انجام شده</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Row 2: Status Indicator (Clickable to toggle done/undone) */}
                          <div className="flex items-center justify-between border-b border-zinc-700/40 pb-1.5 mb-1.5">
                            <button
                              type="button"
                              onClick={(e) => handleToggleStatus(service, e)}
                              className={`flex items-center gap-1.5 font-bold text-[11px] rounded px-1.5 py-0.5 transition ${
                                isDone
                                  ? "text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20"
                                  : "text-red-400 bg-red-500/10 hover:bg-red-500/20"
                              }`}
                              title="برای تغییر وضعیت کلیک کنید"
                            >
                              {isDone ? (
                                <>
                                  <Check size={13} className="text-emerald-400 stroke-[3]" />
                                  <span>انجام شده است</span>
                                </>
                              ) : (
                                <>
                                  <X size={13} className="text-red-400 stroke-[3]" />
                                  <span>انجام نشده است</span>
                                </>
                              )}
                            </button>

                            {/* Technician with badge count */}
                            <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                              <span>{service.technician}</span>
                              <span className="rounded bg-emerald-950/80 border border-emerald-500/40 px-1 py-0.2 text-[9.5px] font-bold text-emerald-400">
                                +{service.techCount}
                              </span>
                              <User size={12} className="text-emerald-400 shrink-0 mr-0.5" />
                            </div>
                          </div>

                          {/* Row 3: Zone (منطقه) */}
                          <div className="flex items-center justify-between gap-1 text-[10.5px] text-zinc-400 mb-1">
                            <span className="truncate">{service.zone}</span>
                            <span className="flex items-center gap-1 shrink-0 text-zinc-500">
                              <span>منطقه</span>
                              <MapPin size={11} className="text-zinc-400" />
                            </span>
                          </div>

                          {/* Row 4: Contract Number (شماره قرارداد) */}
                          <div className="flex items-center justify-between gap-1 text-[10.5px] text-zinc-400 mb-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenContract?.(service.contractNo);
                              }}
                              className="font-mono text-zinc-300 hover:text-amber-400 hover:underline"
                            >
                              {service.contractNo}
                            </button>
                            <span className="flex items-center gap-1 shrink-0 text-zinc-500">
                              <span>شماره قرارداد</span>
                              <FileCheck size={11} className="text-zinc-400" />
                            </span>
                          </div>

                          {/* Row 5: Customer Name (مشتری) */}
                          <div className="flex items-center justify-between gap-1 text-[10.5px] text-zinc-400">
                            <span className="truncate text-zinc-300">
                              * {service.customerName}
                            </span>
                            <span className="flex items-center gap-1 shrink-0 text-zinc-500">
                              <span>مشتری</span>
                              <span className="text-amber-400 text-[10px]">★</span>
                            </span>
                          </div>

                          {/* Optional: Has report or parts indicator */}
                          {(service.report || (service.partsRequested && service.partsRequested.length > 0)) && (
                            <div className="mt-2 flex items-center gap-1 border-t border-zinc-700/30 pt-1 text-[9.5px]">
                              {service.report && (
                                <span className="flex items-center gap-0.5 text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded">
                                  <FileText size={9} />
                                  <span>دارای گزارش</span>
                                </span>
                              )}
                              {service.partsRequested && service.partsRequested.length > 0 && (
                                <span className="flex items-center gap-0.5 text-orange-400 bg-orange-500/10 px-1 py-0.2 rounded">
                                  <Wrench size={9} />
                                  <span>{service.partsRequested.length} درخواست قطعه</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODALS */}

      {/* 1. Modal: Checklist Print Preview */}
      {modalType === "checklist" && targetService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-400/30">
                  <Printer size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">چک‌لیست سرویس و نگهداری آسانسور</h3>
                  <p className="text-[11px] text-zinc-400">{targetService.buildingName} - قرارداد {targetService.contractNo}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Checklist details header */}
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-zinc-800/40 p-3 text-[11.5px] mb-4 border border-zinc-800">
              <div><span className="text-zinc-500">سرویسکار:</span> <span className="font-medium text-amber-400">{targetService.technician}</span></div>
              <div><span className="text-zinc-500">تاریخ سرویس:</span> <span className="font-medium text-zinc-200">{targetService.date}</span></div>
              <div><span className="text-zinc-500">مشتری:</span> <span className="font-medium text-zinc-200">{targetService.customerName}</span></div>
              <div><span className="text-zinc-500">منطقه:</span> <span className="font-medium text-zinc-200">{targetService.zone}</span></div>
            </div>

            {/* Checklist items */}
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4 divide-y divide-zinc-800/50">
              {checklistItems.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2.5 pt-2 text-[12px] text-zinc-200 cursor-pointer hover:text-amber-300"
                >
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => {
                      setChecklistItems((curr) =>
                        curr.map((it) =>
                          it.id === item.id ? { ...it, checked: e.target.checked } : it
                        )
                      );
                    }}
                    className="h-4 w-4 rounded border-zinc-600 accent-amber-500"
                  />
                  <span>{item.text}</span>
                </label>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  window.print();
                  onShowToast?.("دستور چاپ چک‌لیست صادر شد.");
                  setModalType(null);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-1.5 text-[12px] font-bold text-neutral-950 shadow-md"
              >
                <Printer size={14} />
                <span>چاپ رسمی فرم</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Service Reminder */}
      {modalType === "reminder" && targetService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-400/30">
                  <Bell size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">ارسال پیامک یادآوری سرویس</h3>
                  <p className="text-[11px] text-zinc-400">ساختمان {targetService.buildingName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-4 text-[12px]">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">شماره همراه گیرنده:</label>
                <input
                  type="text"
                  defaultValue={targetService.customerPhone || "09121812345"}
                  className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">متن پیامک یادآوری:</label>
                <textarea
                  rows={4}
                  defaultValue={`مدیریت محترم ساختمان ${targetService.buildingName}\nبا سلام، به اطلاع می‌رساند سرویس دوره‌ای آسانسور شما در تاریخ ${targetService.date} توسط کارشناس محترم ${targetService.technician} انجام خواهد شد.\nشرکت خدمات آسانسور`}
                  className={`w-full rounded-lg border p-2.5 text-[12px] outline-none leading-5 ${t.input}`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  onShowToast?.(`پیامک یادآوری به مدیریت «${targetService.buildingName}» با موفقیت ارسال شد.`);
                  setModalType(null);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-1.5 text-[12px] font-bold text-neutral-950 shadow-md"
              >
                <Send size={13} />
                <span>ارسال پیامک</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Register Part Request */}
      {modalType === "partRequest" && targetService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20 text-orange-400 border border-orange-400/30">
                  <Wrench size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">ثبت درخواست قطعه مصرفی / تعویضی</h3>
                  <p className="text-[11px] text-zinc-400">{targetService.buildingName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-4 text-[12px]">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">نام قطعه مورد نیاز:</label>
                <input
                  type="text"
                  value={partNameInput}
                  onChange={(e) => setPartNameInput(e.target.value)}
                  placeholder="مثال: لنت کفشک کابین، روغن ریل، سوئیچ حد، ..."
                  className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">تعداد / مقدار:</label>
                  <input
                    type="number"
                    min="1"
                    value={partQtyInput}
                    onChange={(e) => setPartQtyInput(e.target.value)}
                    className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">سرویسکار متقاضی:</label>
                  <input
                    type="text"
                    disabled
                    value={targetService.technician}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-800/40 p-2 text-[12px] text-zinc-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">دلیل درخواست / توضیحات فنی:</label>
                <textarea
                  rows={3}
                  value={partReasonInput}
                  onChange={(e) => setPartReasonInput(e.target.value)}
                  placeholder="علت نیاز به تعویض یا سرویس اضطراری..."
                  className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSavePartRequest}
                className="flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 px-4 py-1.5 text-[12px] font-bold text-neutral-950 shadow-md"
              >
                <Check size={14} />
                <span>ثبت درخواست</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal: View Parts Requested */}
      {modalType === "viewParts" && targetService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400 border border-blue-400/30">
                  <Eye size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">قطعات درخواستی برای این سرویس</h3>
                  <p className="text-[11px] text-zinc-400">{targetService.buildingName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {(!targetService.partsRequested || targetService.partsRequested.length === 0) ? (
                <div className="py-6 text-center text-[12px] text-zinc-400">
                  هیچ درخواست قطعه‌ای برای این سرویس ثبت نشده است.
                </div>
              ) : (
                targetService.partsRequested.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-3 text-[11.5px]"
                  >
                    <div className="flex items-center justify-between font-semibold text-zinc-100 mb-1">
                      <span>{p.name}</span>
                      <span className="text-amber-400">{p.qty} عدد</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-4">{p.reason}</p>
                    <div className="mt-1.5 text-[10px] text-zinc-500 text-left">{p.date}</div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-end border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg bg-zinc-800 px-4 py-1.5 text-[12px] text-zinc-200 hover:bg-zinc-700"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal: Register Service Report */}
      {modalType === "report" && targetService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-400/30">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">ثبت گزارش کارشناسی و اتمام سرویس</h3>
                  <p className="text-[11px] text-zinc-400">{targetService.buildingName} - قرارداد {targetService.contractNo}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-4 text-[12px]">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">شرح عملیات انجام شده و وضعیت آسانسور:</label>
                <textarea
                  rows={5}
                  value={reportInput}
                  onChange={(e) => setReportInput(e.target.value)}
                  placeholder="سرویس دوره‌ای ماهانه، آچارکشی اتصالات ریل‌ها، تنظیم لنت‌های ترمز و بازدید چاهک انجام گردید..."
                  className={`w-full rounded-lg border p-3 text-[12px] outline-none leading-5 ${t.input}`}
                />
              </div>
              <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-2 text-[11px] text-emerald-300">
                با ثبت گزارش، وضعیت سرویس به صورت خودکار به «انجام شده است» تغییر یافته و به پایین ستون منتقل می‌شود.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveReport}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-[12px] font-bold text-white shadow-md"
              >
                <CheckCircle2 size={14} />
                <span>ثبت نهایی گزارش</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Modal: Change Service Date */}
      {modalType === "changeDate" && targetService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 border border-sky-400/30">
                  <Clock size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">تغییر تاریخ سرویس</h3>
                  <p className="text-[11px] text-zinc-400">{targetService.buildingName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-4 text-[12px]">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">تاریخ جدید (شمسی):</label>
                <input
                  type="text"
                  value={newDateInput}
                  onChange={(e) => setNewDateInput(e.target.value)}
                  placeholder="مثال: 1405-06-05"
                  className={`w-full rounded-lg border p-2.5 text-[12px] font-mono outline-none ${t.input}`}
                />
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["1405-06-01", "1405-06-02", "1405-06-03", "1405-06-04", "1405-06-05"].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNewDateInput(d)}
                    className="rounded bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-[11px] text-zinc-300"
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveDate}
                className="flex items-center gap-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 px-4 py-1.5 text-[12px] font-bold text-neutral-950 shadow-md"
              >
                <Check size={14} />
                <span>ذخیره تاریخ جدید</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Modal: Change Service Technician */}
      {modalType === "changeTech" && targetService && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400 border border-purple-400/30">
                  <UserCheck size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">تغییر سرویسکار</h3>
                  <p className="text-[11px] text-zinc-400">{targetService.buildingName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-4 text-[12px]">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">انتخاب سرویسکار جدید:</label>
                <select
                  value={newTechInput}
                  onChange={(e) => setNewTechInput(e.target.value)}
                  className={`w-full rounded-lg border p-2.5 text-[12px] outline-none ${t.input}`}
                >
                  {allTechs.map((tch) => (
                    <option key={tch} value={tch}>
                      {tch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleSaveTech}
                className="flex items-center gap-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 px-4 py-1.5 text-[12px] font-bold text-neutral-950 shadow-md"
              >
                <Check size={14} />
                <span>تغییر سرویسکار</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal: Add New Service */}
      {modalType === "newService" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setModalType(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-700 bg-neutral-900 p-5 text-right text-zinc-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-400/30">
                  <Plus size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-[14px]">ثبت سرویس دوره‌ای جدید در زمانبندی</h3>
                  <p className="text-[11px] text-zinc-400">افزودن به جدول روزانه</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 mb-4 text-[12px]">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">نام ساختمان / پروژه:</label>
                <input
                  type="text"
                  value={newBuilding}
                  onChange={(e) => setNewBuilding(e.target.value)}
                  placeholder="مثال: ساختمان ترنج، بلوک سپیدار"
                  className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">نام مشتری:</label>
                  <input
                    type="text"
                    value={newCustomer}
                    onChange={(e) => setNewCustomer(e.target.value)}
                    placeholder="مثال: آقای احمدی"
                    className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">شماره قرارداد:</label>
                  <input
                    type="text"
                    value={newContractNo}
                    onChange={(e) => setNewContractNo(e.target.value)}
                    placeholder="مثال: 5040"
                    className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">تاریخ سرویس:</label>
                  <input
                    type="text"
                    value={newServiceDate}
                    onChange={(e) => setNewServiceDate(e.target.value)}
                    className={`w-full rounded-lg border p-2 text-[12px] font-mono outline-none ${t.input}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">سرویسکار:</label>
                  <select
                    value={newServiceTech}
                    onChange={(e) => setNewServiceTech(e.target.value)}
                    className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                  >
                    {allTechs.map((tch) => (
                      <option key={tch} value={tch}>
                        {tch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">منطقه:</label>
                <input
                  type="text"
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  placeholder="مثال: مسکن مهر قزوین - البرز"
                  className={`w-full rounded-lg border p-2 text-[12px] outline-none ${t.input}`}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[12px] text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleCreateNewService}
                className="flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-1.5 text-[12px] font-bold text-neutral-950 shadow-md"
              >
                <Plus size={14} />
                <span>ثبت و افزودن</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explanation Modal for "در انتظار" (Pending Status) */}
      {showPendingInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowPendingInfo(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-zinc-700 bg-[#1e2024] p-5 shadow-2xl text-right text-zinc-100 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-zinc-700 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="text-red-400" size={20} />
                <h3 className="font-bold text-[14.5px] text-white">
                  وضعیت «در انتظار» یعنی چی؟ (راهنمای کامل)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPendingInfo(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-[12.5px] leading-relaxed text-zinc-300">
              <p>
                عبارت <strong className="text-red-400 font-bold">«{pendingCount} در انتظار»</strong> به معنای{" "}
                <strong>سرویس‌های دوره‌ای آسانسور است که در تقویم یا برنامه زمان‌بندی ثبت شده‌اند، اما هنوز سرویسکار به محل نرفته یا چک‌لیست سرویس تأیید نهایی نشده است.</strong>
              </p>

              <div className="rounded-lg bg-red-950/30 border border-red-800/40 p-3 text-zinc-200 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-red-300 text-[13px]">
                  <span>تفاوت «در انتظار» و «انجام شده»:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11.5px] pt-1">
                  <div className="rounded bg-black/40 border border-red-700/30 p-2">
                    <span className="font-bold text-red-400 block mb-1">⏳ در انتظار (قرمز):</span>
                    <span>موعد سرویس ماهانه فرا رسیده و این آسانسور در صف سرویس توسط تکنسین قرار دارد.</span>
                  </div>
                  <div className="rounded bg-black/40 border border-emerald-700/30 p-2">
                    <span className="font-bold text-emerald-400 block mb-1">✓ انجام شده (سبز):</span>
                    <span>تکنسین آسانسور را سرویس کرده، چک‌لیست پر شده و تیک انجام آن ثبت گردیده است.</span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-black/30 border border-zinc-700/60 p-3 space-y-1.5 text-[11.5px]">
                <span className="font-bold text-amber-400 block text-[12px]">چگونه از حالت «در انتظار» خارج می‌شود؟</span>
                <p>
                  ۱. با کلیک بر روی دکمه دایره‌ای تیک روی هر کارت، یا زدن «انجام شد»، سرویس بلافاصله تأیید می‌شود.<br />
                  ۲. با زدن دکمه «ثبت گزارش»، اطلاعات تکنسین و قطعات پر شده و به لیست انجام‌شده اضافه می‌شود.<br />
                  ۳. با هر بار تأیید، یک عدد از «در انتظار» کم شده و به «انجام شده» افزوده می‌شود.
                </p>
              </div>

              <p className="text-[11.5px] text-zinc-400">
                💡 نکته: با فیلتر بالای صفحه (از روز ۱ تا ۶، یا انتخاب ماه‌ها) می‌توانید فقط برنامه همان روزها را مشاهده نمایید.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
              <span className="text-[11px] text-zinc-500">سامانه خدمات و نگهداری آسانسور آسمان سرا</span>
              <button
                type="button"
                onClick={() => setShowPendingInfo(false)}
                className="rounded-lg bg-amber-500 px-4 py-1.5 text-[12px] font-bold text-black hover:bg-amber-400 transition"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Breakdown Registration Modal */}
      <BreakdownModal
        isOpen={!!breakdownService}
        onClose={() => setBreakdownService(null)}
        title={`ثبت خرابی - ${breakdownService?.buildingName || ""}`}
        onSave={(data) => {
          if (breakdownService) {
            const contract = contracts.find(
              (c) => c.no === breakdownService.contractNo || c.building === breakdownService.buildingName
            );
            const contractId = contract ? contract.id : 1;
            appStore.addContractBreakdown(contractId, {
              status: "در انتظار تایید",
              declaredBy: breakdownService.customerName || "مدیر ساختمان",
              declareDate: data.declareDate,
              declareTime: data.declareTime,
              executionStatus: "در انتظار اعزام کارشناس",
              delayOrAdvance: "به موقع",
              technicians: data.technicians,
              partsAmount: 0,
              report: data.reason,
              description: data.description,
            });
            onShowToast?.(`خرابی برای «${breakdownService.buildingName}» با موفقیت ثبت گردید.`);
            setBreakdownService(null);
          }
        }}
      />
    </div>
  );
}

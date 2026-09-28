import type { Contract, ServiceContractDraft } from "../data";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] || char));
const clean = (value?: string) => (value || "").replace(/^\*\s*/, "").trim();
const line = (value?: string, fallback = "........................................") => value ? `<strong>${escapeHtml(clean(value))}</strong>` : fallback;

export function printServiceMaintenanceContract(contract: Contract, draft?: ServiceContractDraft): boolean {
  const popup = window.open("", "_blank", "width=950,height=850");
  if (!popup) return false;
  const customer = draft?.customerName || contract.customer || contract.manager;
  const address = draft?.address ?? contract.address;
  // مبالغ قرارداد در برنامه به ریال نگهداری می‌شوند؛ متن چاپی مبلغ را به تومان می‌خواهد.
  const amount = draft?.monthlyAmountToman || (contract.monthlyServiceFee ? Math.round(Number(contract.monthlyServiceFee) / 10).toLocaleString("fa-IR") : "........................................");
  const representative = draft?.representative || "محسن امامی برسری";
  const deviceCount = draft?.deviceCount || "..........";
  const stops = draft?.stops || "..........";
  const doorType = draft?.doorType || "..........";
  const capacityPersons = draft?.capacityPersons || "..........";
  const capacityKg = draft?.capacityKg || "..........";
  popup.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>قرارداد سرویس و نگهداری ${escapeHtml(contract.no)}</title><style>
  @font-face{font-family:vazir;src:local(Tahoma)}*{box-sizing:border-box}body{font-family:vazir,Tahoma,sans-serif;color:#111;background:#fff;margin:0;padding:0;font-size:11.5px;line-height:2;text-align:justify}.page{width:210mm;min-height:297mm;margin:auto;padding:10mm 13mm 8mm}.title{text-align:center;font-size:16px;font-weight:800;border-bottom:2px solid #111;padding-bottom:5px;margin-bottom:8px}.meta{display:flex;justify-content:space-between;font-size:10px}.subject{font-weight:800}.notice{font-weight:800;text-align:center;font-size:12px}.terms{margin:4px 0;padding-right:20px}.terms li{padding-right:2px}.signatures{display:flex;justify-content:space-between;margin-top:18px;height:65px;font-weight:bold}.footer{border-top:2px solid #111;padding-top:6px;text-align:center;font-weight:700;font-size:10.5px}.field{border-bottom:1px dotted #333;padding:0 5px}.no-print{position:fixed;left:18px;top:18px;background:#1677ff;color:#fff;border:0;border-radius:8px;padding:9px 18px;cursor:pointer}@media print{.no-print{display:none}.page{padding:7mm 11mm}body{font-size:10.5px;line-height:1.85}}@page{size:A4 portrait;margin:0}
  </style></head><body><button class="no-print" onclick="window.print()">چاپ قرارداد</button><main class="page">
  <div class="title">قرارداد سرویس و نگهداری شرکت بنیان نوین گستر آسمان‌سرا</div>
  <div class="meta"><span>شماره قرارداد: <b>${escapeHtml(contract.no)}</b></span><span>تاریخ تنظیم: ${line(contract.signDate, "....................")}</span></div>
  <p>جناب آقای / سرکار خانم: ${line(customer)}</p><p><b>با سلام</b></p>
  <p>احتراماً پیرو درخواست حضرتعالی جهت سرویس و نگهداری یک دستگاه آسانسور کششی به آدرس: <span class="field">${line(address)}</span> به‌عنوان کارفرما و آقای <b>${escapeHtml(representative)}</b> به نمایندگی شرکت بنیان نوین گستر آسمان‌سرا به‌عنوان پیمانکار، این قرارداد به شرح ذیل منعقد می‌گردد:</p>
  <p><span class="subject">موضوع قرارداد:</span> سرویس و نگهداری و رفع عیب <b>${escapeHtml(deviceCount)}</b> دستگاه آسانسور <b>${escapeHtml(stops)}</b> توقف با درب <b>${escapeHtml(doorType)}</b> اتوماتیک با ظرفیت <b>${escapeHtml(capacityPersons)}</b> نفر معادل <b>${escapeHtml(capacityKg)}</b> کیلوگرم.</p>
  <p><span class="subject">مدت قرارداد:</span> به مدت یک سال از تاریخ <span class="field">${line(draft?.startDate || contract.start, "....................")}</span> لغایت <span class="field">${line(draft?.endDate || contract.end, "....................")}</span> خواهد بود. بازه سرویس‌دهی به دلیل خرابی‌های پیش‌بینی‌نشده ۱ تا ۷ روز قابل جابه‌جایی می‌باشد. صرفاً فقط در تاریخ مذکور، سرویس انجام نمی‌شود.</p>
  <p><span class="subject">مبلغ قرارداد:</span> دستمزد ماهیانه <span class="field">${amount}</span> تومان می‌باشد.</p>
  <p><span class="subject">نحوه پرداخت:</span> در پایان ماه توسط کارفرما پرداخت خواهد شد.</p>
  <p class="subject">تعهدات پیمانکار:</p>
  <p>پیمانکار متعهد می‌گردد ماهیانه آسانسور مورد قرارداد را سرویس نماید و پس از اتمام، سرویس چک‌لیست مربوط به سرویس‌کاری را به کارفرما تحویل دهد؛ در صورت اعلام خرابی ظرف مدت ۲۴ ساعت نسبت به رفع آن اقدام نماید. ساعات کار شرکت از ساعت ۹ صبح الی ۱۷ بعدازظهر می‌باشد و بعد از ساعت ۱۷ پیمانکار پاسخگوی تماس‌ها نخواهد بود. چنانچه کارفرما یا نماینده ایشان تا قبل از ساعت اداری ۱۴ همان روز اعلام خرابی نمایند، در شرایط اولویت خرابی پرسنل فنی شرکت جهت رفع خرابی اعزام خواهند شد؛ در غیر این صورت اعزام تعمیرکار فردای آن روز انجام می‌پذیرد.</p>
  <p class="notice">در صورت اعزام برای رفع خرابی، هزینه ایاب و ذهاب معادل ۳۰٪ مبلغ قرارداد بر عهده کارفرما می‌باشد.</p>
  <p><b>تبصره:</b> سرویس و رفع خرابی در روزهای تعطیل انجام نمی‌پذیرد.</p>
  <p class="subject">تعهدات کارفرما:</p><ol class="terms">
  <li>کارفرما یا نماینده ایشان موظف است به محض مشاهده نقص در آسانسور، مراتب را به پیمانکار اطلاع دهد و از هرگونه دستکاری در سیستم آسانسور جداً خودداری نماید. در صورتی که برای پیمانکار مشخص گردد در سیستم آسانسور دستکاری صورت گرفته، پیمانکار مجاز است از تعمیر و انجام تعهدات دیگر خودداری نماید.</li>
  <li>چنانچه شخص یا اشخاصی داخل آسانسور به هر دلیلی (فنی، قطع برق و غیره) محبوس شوند، مدیریت ساختمان باید بلافاصله ابتدا با شرکت و سپس آتش‌نشانی ۱۲۵ تماس بگیرد.</li>
  <li>پرداخت بهای قطعات و مواد مصرفی جهت رفع عیب و معایب سرویس و نگهداری آسانسور بر عهده کارفرما خواهد بود.</li>
  <li>در صورت عدم پرداخت هزینه سرویس و نگهداری، شرکت مجاز می‌باشد یک‌طرفه قرارداد را فسخ نماید و آسانسور را خاموش نموده تا طلب خود را وصول کند و هرگونه مسئولیت و حادثه احتمالی بر عهده مدیریت ساختمان و مصرف‌کنندگان آسانسور می‌باشد.</li>
  <li>کارفرما موظف است یک خط تلفن مجزا برای داخل کابین فراهم نماید.</li>
  <li>بیمه و استاندارد آسانسور بر عهده مدیریت ساختمان می‌باشد و شرکت هیچ مسئولیتی در این باره ندارد.</li>
  <li>با وجود اینکه مدت قرارداد دقیقاً تعیین شده، چنانچه کارفرما در خاتمه مدت قرارداد نسبت به تمدید و عقد قرارداد اقدام ننماید، شرکت از تاریخ خاتمه قرارداد هیچ‌گونه مسئولیتی در خصوص آسانسور موردنظر نخواهد داشت.</li></ol>
  <p>این قرارداد در دو نسخه تنظیم، امضا و مبادله گردیده که هر نسخه در حکم واحد و مفاد آن برای طرفین لازم‌الاجرا خواهد بود و در صورت اختلاف بین کارفرما و پیمانکار، ملاک عمل اتحادیه آسانسور یا سازمان صنعت، معدن و تجارت (واحد آسانسور) می‌باشد.</p>
  <div class="signatures"><span>امضای کارفرما</span><span>امضا و مهر نماینده شرکت</span></div>
  <div class="footer">شرکت بنیان نوین گستر آسمان‌سرا — شماره ثبت ۳۱۳۸<br>آدرس: الوند، فلکه دوم شهر صنعتی، جنب بانک ملی، ساختمان نوین<br>تلفن: ۰۹۱۲۶۸۱۰۶۴۹ — ۰۹۱۹۲۸۶۸۵۰۹</div>
  </main></body></html>`);
  popup.document.close();
  popup.focus();
  return true;
}

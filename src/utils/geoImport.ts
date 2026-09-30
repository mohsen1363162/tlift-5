/*
 * ورود گروهی موقعیت GPS ساختمان‌ها از CSV / TSV یا متن چسبانده‌شده (منطق خالص؛ بدون React تا جدا تست شود).
 *
 * اصل کار: هیچ‌چیز بی‌صدا نوشته نمی‌شود. ابتدا «طرح ورود» ساخته می‌شود که برای هر سطر دقیقاً می‌گوید چه می‌شود
 * (جدید، جایگزین، بدون تغییر، پیدا نشد، نامعتبر…) و فقط بعد از تأیید کاربر سطرهای «جدید/جایگزین» ذخیره می‌شوند.
 * مختصات بی‌دقت یا مشکوک (خارج از ایران، جابه‌جاشدن عرض و طول، کمتر از ۴ رقم اعشار) پذیرفته نمی‌شود؛ چون با الزام
 * «حضور در محل برای شروع سرویس» یک مختصات غلط می‌تواند مانع شروع سرویس همکار شود.
 */

export type GeoContract = {
  id: number;
  no?: string;
  contractNo?: string;
  building?: string;
  buildingName?: string;
  address?: string;
  isCanceled?: boolean;
};
export type GeoExisting = { contractId: number; latitude: number; longitude: number };

export type GeoRowStatus = "new" | "replace" | "same" | "keep" | "empty" | "noMatch" | "ambiguous" | "invalid" | "duplicate";

export type GeoImportRow = {
  /** شمارهٔ سطر در متن ورودی (از ۱) */
  line: number;
  /** متن خام سطر برای نمایش */
  source: string;
  status: GeoRowStatus;
  reason?: string;
  contractId?: number;
  building?: string;
  latitude?: number;
  longitude?: number;
  previous?: { latitude: number; longitude: number };
};

export type GeoImportPlan = {
  rows: GeoImportRow[];
  counts: Record<GeoRowStatus, number>;
  headerDetected: boolean;
  delimiter: string;
  /** مشکل کلی (متن خالی، ستون مختصات پیدا نشد…) */
  problem?: string;
};

/** محدودهٔ ایران (با حاشیه)؛ مختصات بیرون از آن تقریباً حتماً اشتباه یا جابه‌جاشدهٔ عرض و طول است. */
export const IRAN_BOX = { minLat: 24, maxLat: 40, minLng: 43, maxLng: 64 } as const;
/** کمترین تعداد رقم اعشار: ۴ رقم حدود ۱۰ متر دقت می‌دهد؛ کمتر از آن مثل گرد شدن در Excel یا مختصات شهر است. */
export const MIN_DECIMALS = 4;
/** دو موقعیت کمتر از این فاصله (متر) یکی حساب می‌شوند. */
const SAME_PLACE_METERS = 1;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const toAsciiDigits = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));

const fa = (value: number) => value.toLocaleString("fa-IR");

/* ------------------------------ parsing numbers ------------------------------ */

type ParsedNumber = { value: number; decimals: number };

export function parseCoordinateNumber(raw: string): ParsedNumber | null {
  let text = toAsciiDigits(raw)
    .replace(/[\u200c\u200e\u200f\u00a0\s]/g, "")
    .replace(/\u200d/g, "")
    .replace(/[\u2212\u2012\u2013\u2014]/g, "-")
    .replace(/°/g, "")
    .replace(/٫/g, ".");
  if (/^[+-]?\d+[,،]\d+$/.test(text)) text = text.replace(/[,،]/, "."); // اعشار با ویرگول: ۳۶٫۲۷ یا 36,27
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return { value, decimals: (text.split(".")[1] || "").length };
}

/** یک خانه با هر دو عدد، مثل «36.2688, 50.0041» که از Google Maps کپی می‌شود. */
function parsePair(raw: string): [ParsedNumber, ParsedNumber] | null {
  const parts = toAsciiDigits(raw)
    .replace(/٫/g, ".")
    .split(/[\s,;،|/]+/)
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const first = parseCoordinateNumber(parts[0]);
  const second = parseCoordinateNumber(parts[1]);
  return first && second ? [first, second] : null;
}

const inIran = (lat: number, lng: number) =>
  lat >= IRAN_BOX.minLat && lat <= IRAN_BOX.maxLat && lng >= IRAN_BOX.minLng && lng <= IRAN_BOX.maxLng;

/** نتیجه: مختصات معتبر یا دلیل فارسی رد شدن. */
export type CoordinateCheck = { ok: boolean; latitude: number; longitude: number; reason: string };
export function validateCoordinates(lat: ParsedNumber, lng: ParsedNumber): CoordinateCheck {
  const reject = (reason: string): CoordinateCheck => ({ ok: false, latitude: NaN, longitude: NaN, reason });
  if (Math.abs(lat.value) > 90 || Math.abs(lng.value) > 180) {
    return reject("عرض جغرافیایی باید بین منفی ۹۰ و ۹۰ و طول بین منفی ۱۸۰ و ۱۸۰ باشد");
  }
  if (!inIran(lat.value, lng.value)) {
    return inIran(lng.value, lat.value)
      ? reject("عرض و طول جابه‌جا به نظر می‌رسد (عرض ایران حدود ۲۵ تا ۴۰ است)")
      : reject("مختصات خارج از محدودهٔ ایران است");
  }
  if (lat.decimals < MIN_DECIMALS || lng.decimals < MIN_DECIMALS) {
    return reject(`مختصات کم‌دقت است؛ حداقل ${fa(MIN_DECIMALS)} رقم اعشار لازم است (مثلاً ۳۶٫۲۶۸۸۰۱)`);
  }
  return { ok: true, latitude: lat.value, longitude: lng.value, reason: "" };
}

/* ------------------------------ parsing the table ------------------------------ */

// ترتیب اولویت هنگام برابری: تب، «;»، «,». ویرگول فارسی «،» فقط وقتی جداکننده است که هیچ‌کدام از بقیه در فایل نباشد
// (در نام ساختمان‌ها زیاد دیده می‌شود و نباید جداکننده فرض شود).
const DELIMITERS = ["\t", ";", ",", "،"] as const;

function detectDelimiter(text: string): string {
  const lines = text.split("\n").filter((line) => line.trim()).slice(0, 8);
  let best = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    for (const line of lines) count += line.replace(/"[^"]*"/g, "").split(delimiter).length - 1;
    if (count > bestCount) { best = delimiter; bestCount = count; }
  }
  return best;
}

type RawRow = { line: number; cells: string[]; source: string };

function tokenize(text: string, delimiter: string): RawRow[] {
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;
  let rowStart = 0;
  const endRow = (endIndex: number) => {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== "")) rows.push({ line: rowLine, cells, source: text.slice(rowStart, endIndex).trim() });
    cells = [];
    cell = "";
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') { cell += '"'; index++; } else inQuotes = false;
      } else {
        if (char === "\n") line++;
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      inQuotes = true;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n") {
      endRow(index);
      line++;
      rowLine = line;
      rowStart = index + 1;
    } else {
      cell += char;
    }
  }
  if (cell !== "" || cells.length) endRow(text.length);
  return rows;
}

// فایل‌های قدیمیِ «ANSI/ویندوز-۱۲۵۶» ی و ک را عربی (ي، ك) ذخیره می‌کنند؛ عنوان‌ها و نام‌ها باید با املای فارسی یکی حساب شوند.
const arabicToPersian = (value: string) => value.replace(/ي/g, "ی").replace(/ك/g, "ک");
const normalizeHeader = (value: string) => arabicToPersian(toAsciiDigits(value)).toLowerCase().replace(/[\s_\-.:()\u200c"']/g, "");
const HEADER_WORDS = {
  no: ["شمارهقرارداد", "قرارداد", "شماره", "کد", "کدقرارداد", "contractno", "contractnumber", "contract", "no", "number", "code"],
  building: ["ساختمان", "نامساختمان", "مشتری", "نام", "building", "buildingname", "name", "customer"],
  lat: ["عرضجغرافیایی", "عرض", "lat", "latitude"],
  lng: ["طولجغرافیایی", "طول", "lng", "lon", "long", "longitude"],
  both: ["موقعیت", "مختصات", "موقعیتجغرافیایی", "location", "coordinates", "coords", "latlng", "latlong", "gps", "position"],
} as const;
type ColumnKind = keyof typeof HEADER_WORDS;

const headerKind = (cell: string): ColumnKind | null => {
  const key = normalizeHeader(cell);
  if (!key) return null;
  for (const kind of Object.keys(HEADER_WORDS) as ColumnKind[]) {
    if ((HEADER_WORDS[kind] as readonly string[]).includes(key)) return kind;
  }
  return null;
};

type Columns = { no: number; building: number; lat: number; lng: number; both: number };

/** نام ساختمان برای تطبیق: ارقام انگلیسی، ی/ک فارسی، بدون نیم‌فاصله، علائم و «*» ابتدای نام. */
export function normalizeName(value: string): string {
  return arabicToPersian(toAsciiDigits(value))
    .replace(/[\u200c\u200d]/g, " ")
    .replace(/^\s*\*+\s*/, "")
    .toLowerCase()
    .replace(/[،,.:;()\-_/\\"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const normalizeNumber = (value: string) => toAsciiDigits(value).replace(/[\s\u200c]/g, "").toLowerCase();

const emptyCounts = (): Record<GeoRowStatus, number> => ({
  new: 0, replace: 0, same: 0, keep: 0, empty: 0, noMatch: 0, ambiguous: 0, invalid: 0, duplicate: 0,
});

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function planGeoImport(
  input: string,
  contracts: readonly GeoContract[],
  existing: readonly GeoExisting[],
  options: { overwrite?: boolean } = {}
): GeoImportPlan {
  const overwrite = !!options.overwrite;
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const plan: GeoImportPlan = { rows: [], counts: emptyCounts(), headerDetected: false, delimiter: "," };
  if (!text.trim()) return { ...plan, problem: "متنی برای ورود وارد نشده است." };

  const delimiter = detectDelimiter(text);
  plan.delimiter = delimiter;
  const table = tokenize(text, delimiter);
  if (!table.length) return { ...plan, problem: "هیچ سطری پیدا نشد." };

  // ستون‌ها: از روی سطر عنوان، و اگر عنوان نبود به ترتیب «کلید، عرض، طول» یا «کلید، مختصات».
  const firstKinds = table[0].cells.map(headerKind);
  const headerDetected = firstKinds.some(Boolean);
  plan.headerDetected = headerDetected;
  const columns: Columns = { no: -1, building: -1, lat: -1, lng: -1, both: -1 };
  let dataRows = table;
  if (headerDetected) {
    firstKinds.forEach((kind, index) => { if (kind && columns[kind] < 0) columns[kind] = index; });
    dataRows = table.slice(1);
    if (columns.both < 0 && (columns.lat < 0 || columns.lng < 0)) {
      return { ...plan, problem: "ستون عرض و طول جغرافیایی در سطر عنوان پیدا نشد (مثلاً: شماره قرارداد، عرض جغرافیایی، طول جغرافیایی)." };
    }
    if (columns.no < 0 && columns.building < 0) {
      return { ...plan, problem: "ستون «شماره قرارداد» یا «ساختمان» در سطر عنوان پیدا نشد." };
    }
  } else {
    const width = Math.max(...table.map((row) => row.cells.length));
    if (width < 2) return { ...plan, problem: "ستون‌ها شناسایی نشد؛ هر سطر باید «شماره قرارداد، عرض، طول» باشد." };
    columns.no = 0;
    if (width === 2) columns.both = 1; else { columns.lat = 1; columns.lng = 2; }
  }

  // نمایه‌ها برای تطبیق
  const byNumber = new Map<string, GeoContract[]>();
  const byName = new Map<string, GeoContract[]>();
  const push = (map: Map<string, GeoContract[]>, key: string, contract: GeoContract) => {
    if (!key) return;
    const list = map.get(key);
    if (!list) map.set(key, [contract]);
    else if (!list.includes(contract)) list.push(contract);
  };
  for (const contract of contracts) {
    push(byNumber, normalizeNumber(contract.no || ""), contract);
    push(byNumber, normalizeNumber(contract.contractNo || ""), contract);
    push(byName, normalizeName(contract.building || ""), contract);
    push(byName, normalizeName(contract.buildingName || ""), contract);
  }
  const existingById = new Map(existing.map((item) => [item.contractId, item]));
  const claimedAtLine = new Map<number, number>();

  for (const row of dataRows) {
    const cell = (index: number) => (index >= 0 ? (row.cells[index] ?? "").trim() : "");
    const result: GeoImportRow = { line: row.line, source: row.source, status: "invalid" };

    // ۱) مختصات
    const latCell = cell(columns.lat);
    const lngCell = cell(columns.lng);
    const bothCell = cell(columns.both);
    const coordinateText = columns.both >= 0 ? bothCell : `${latCell}${lngCell}`;
    if (!coordinateText.trim()) {
      result.status = "empty";
      result.reason = "مختصات وارد نشده؛ این سطر نادیده گرفته شد";
      finish(plan, result);
      continue;
    }

    // ۲) تطبیق با قرارداد: اول شماره، بعد نام دقیق ساختمان (بدون سطر عنوان، ستون اول هم می‌تواند نام باشد)
    const keyCell = cell(columns.no);
    const numberKey = normalizeNumber(keyCell);
    let candidates: GeoContract[] = numberKey ? byNumber.get(numberKey) || [] : [];
    if (!candidates.length) {
      const nameKey = normalizeName(cell(columns.building) || (headerDetected ? "" : keyCell));
      if (nameKey) candidates = byName.get(nameKey) || [];
    }
    if (!candidates.length) {
      result.status = "noMatch";
      result.reason = "قراردادی با این شماره یا نام پیدا نشد";
      finish(plan, result);
      continue;
    }
    if (candidates.length > 1) {
      result.status = "ambiguous";
      result.reason = "چند قرارداد با این شماره یا نام وجود دارد؛ شمارهٔ دقیق قرارداد را بنویسید";
      finish(plan, result);
      continue;
    }
    const contract = candidates[0];
    result.contractId = contract.id;
    result.building = (contract.building || contract.buildingName || "").replace(/^\*\s*/, "");

    // ۳) اعتبار مختصات
    let latNumber: ParsedNumber | null;
    let lngNumber: ParsedNumber | null;
    // «عرض، طول» در یک خانه (مثل کپی از Google Maps)؛ در فایل بدون عنوان هم وقتی ستون سوم خالی است
    const pair = columns.both >= 0 ? parsePair(bothCell) : !lngCell ? parsePair(latCell) : null;
    if (pair) {
      latNumber = pair[0];
      lngNumber = pair[1];
    } else if (columns.both >= 0) {
      latNumber = null;
      lngNumber = null;
    } else {
      latNumber = parseCoordinateNumber(latCell);
      lngNumber = parseCoordinateNumber(lngCell);
    }
    if (!latNumber || !lngNumber) {
      result.reason = "عرض یا طول جغرافیایی عدد معتبر نیست (فقط عدد اعشاری مثل ۳۶٫۲۶۸۸۰۱؛ درجه/دقیقه/ثانیه پذیرفته نمی‌شود)";
      finish(plan, result);
      continue;
    }
    const valid = validateCoordinates(latNumber, lngNumber);
    if (!valid.ok) {
      result.reason = valid.reason;
      finish(plan, result);
      continue;
    }
    result.latitude = valid.latitude;
    result.longitude = valid.longitude;

    // ۴) تکراری در همین فایل؛ سطر اول می‌ماند
    const firstLine = claimedAtLine.get(contract.id);
    if (firstLine !== undefined) {
      result.status = "duplicate";
      result.reason = `همین ساختمان در سطر ${fa(firstLine)} هم آمده؛ سطر اول استفاده می‌شود`;
      finish(plan, result);
      continue;
    }
    claimedAtLine.set(contract.id, row.line);

    // ۵) موقعیت ثبت‌شدهٔ قبلی
    const previous = existingById.get(contract.id);
    if (!previous) {
      result.status = "new";
    } else {
      result.previous = { latitude: previous.latitude, longitude: previous.longitude };
      if (distanceMeters(previous.latitude, previous.longitude, valid.latitude, valid.longitude) < SAME_PLACE_METERS) {
        result.status = "same";
        result.reason = "همان موقعیت ثبت‌شده است؛ تغییری نمی‌کند";
      } else if (overwrite) {
        result.status = "replace";
      } else {
        result.status = "keep";
        result.reason = "موقعیت از قبل ثبت شده؛ بدون گزینهٔ «جایگزینی» تغییر نمی‌کند";
      }
    }
    finish(plan, result);
  }
  if (!plan.rows.length) plan.problem = "بعد از سطر عنوان هیچ سطر دادهای پیدا نشد.";
  return plan;
}

function finish(plan: GeoImportPlan, row: GeoImportRow) {
  plan.rows.push(row);
  plan.counts[row.status]++;
}

/** سطرهایی که واقعاً ذخیره می‌شوند. */
export const applicableRows = (plan: GeoImportPlan) => plan.rows.filter((row) => row.status === "new" || row.status === "replace");

/** ورودی آمادهٔ appStore.setContractGeoLocations. دقت GPS برای مختصات واردشده نامعلوم است و ثبت نمی‌شود. */
export function entriesFromPlan(plan: GeoImportPlan, now: number) {
  return applicableRows(plan).map((row) => ({ contractId: row.contractId!, latitude: row.latitude!, longitude: row.longitude!, updatedAt: now }));
}

/* ------------------------------ template export ------------------------------ */

const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

/** فهرست ساختمان‌های فعال بدون موقعیت، آمادهٔ پر کردن عرض و طول و ورود دوباره (همان عنوان‌ها شناسایی می‌شوند). */
export function missingGeoCsv(contracts: readonly GeoContract[], existing: readonly GeoExisting[]): string {
  const have = new Set(existing.map((item) => item.contractId));
  const lines = [["شماره قرارداد", "ساختمان", "آدرس", "عرض جغرافیایی", "طول جغرافیایی"].map(quote).join(",")];
  for (const contract of contracts) {
    if (contract.isCanceled || have.has(contract.id)) continue;
    lines.push([contract.no || contract.contractNo || "", (contract.building || contract.buildingName || "").replace(/^\*\s*/, ""), contract.address || "", "", ""].map(quote).join(","));
  }
  return "\uFEFF" + lines.join("\n");
}

export const missingGeoCount = (contracts: readonly GeoContract[], existing: readonly GeoExisting[]) => {
  const have = new Set(existing.map((item) => item.contractId));
  return contracts.filter((contract) => !contract.isCanceled && !have.has(contract.id)).length;
};

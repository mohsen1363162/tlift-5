import type { Contract } from "../data";

export type RegionServiceRecord = { region: string; name: string; phone?: string; raw: string; canceled: boolean; address: string; keyLocation?: string };
export type RegionImportResult = { regions: string[]; records: RegionServiceRecord[]; matched: number; canceled: number; unmatched: RegionServiceRecord[]; updated: Contract[] };

const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const arDigits = "٠١٢٣٤٥٦٧٨٩";
export const normalizeDigits = (value: string) => value.replace(/[۰-۹]/g, d => String(faDigits.indexOf(d))).replace(/[٠-٩]/g, d => String(arDigits.indexOf(d))).replace(/[\u200c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "");
const clean = (value: string) => normalizeDigits(value).replace(/[ـ*_#]/g, " ").replace(/\s+/g, " ").trim();
const norm = (value: string) => clean(value).toLowerCase().replace(/[أإ]/g,"ا").replace(/ي/g,"ی").replace(/ك/g,"ک");
const phoneOf = (text: string) => normalizeDigits(text).match(/(?:\+?98|0)?9\d{9}/)?.[0].replace(/^98/,"0");

export function parseRegionServiceText(text: string): { regions: string[]; records: RegionServiceRecord[] } {
  const normalized = text.replace(/\r/g, "");
  const chunks = normalized.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
  const regions: string[] = [];
  const records: RegionServiceRecord[] = [];
  let region = "";
  for (const chunk of chunks) {
    const lines = chunk.split("\n").map(x => x.trim()).filter(Boolean);
    const heading = lines.find(line => /^\s*#/.test(line));
    if (heading) {
      region = clean(heading).replace(/[_-]+/g," ").replace(/\s+(?:\d+\s*(?:تا|آسانسور)?|منطقه\s*\d+)\s*$/, "").trim();
      if (region && !regions.includes(region)) regions.push(region);
      const rest = lines.filter(line => line !== heading).join("\n").trim();
      if (!rest) continue;
    }
    if (!region || /^ا\s+قاسمعلی/.test(clean(chunk))) continue;
    const raw = lines.filter(line => !/^#/.test(line)).join("\n");
    if (!raw) continue;
    const canceled = /کنسل/.test(raw);
    const phone = phoneOf(raw);
    const first = clean(lines[0]);
    const phoneIndex = phone ? first.indexOf(phone) : -1;
    let name = phoneIndex > 0 ? first.slice(0, phoneIndex) : first;
    name = name.replace(/\b\d[\d,،.]*\b/g, " ").replace(/\s+/g," ").trim();
    const keyLine = lines.find(line => /کلید/.test(line));
    records.push({ region, name, phone, raw, canceled, address: raw, keyLocation: keyLine ? clean(keyLine).slice(0, 300) : undefined });
  }
  return { regions, records };
}

export function matchRegionServices(text: string, contracts: Contract[]): RegionImportResult {
  const { regions, records } = parseRegionServiceText(text);
  const updated = [...contracts];
  const unmatched: RegionServiceRecord[] = [];
  let matched = 0;
  for (const record of records) {
    if (record.canceled) continue;
    const recordPhone = record.phone?.replace(/\D/g, "").slice(-10);
    let index = recordPhone ? updated.findIndex(c => (c.phone || c.coordinatorPhone || "").replace(/\D/g, "").slice(-10) === recordPhone) : -1;
    if (index < 0) {
      const words = norm(record.name).split(" ").filter(w => w.length > 2).slice(0, 3);
      index = updated.findIndex(c => words.length > 0 && words.every(word => norm(`${c.building} ${c.manager}`).includes(word)));
    }
    if (index < 0) { unmatched.push(record); continue; }
    const current = updated[index];
    updated[index] = { ...current, zone: record.region, phone: current.phone || record.phone, address: current.address || record.address, triangleKeyLocation: current.triangleKeyLocation || record.keyLocation, additionalNotes: [current.additionalNotes, record.raw].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join("\n\n") };
    matched++;
  }
  return { regions, records, matched, canceled: records.filter(r=>r.canceled).length, unmatched, updated };
}

import { MATERIAL_CATALOG, MATERIAL_CATALOG_VERSION, type MaterialCatalogEntry } from '../data/materialCatalog';
import type { PartItem } from '../partsStore';

export const normalizeMaterialText = (value: string = '') => value.toLowerCase()
  .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s\u200c\u200dـ\-–_،,]+/g, '');

// Pre-index reviewed names once; catalog import must not block mobile rendering.
const entriesByName = new Map<string, MaterialCatalogEntry[]>();
for (const entry of MATERIAL_CATALOG) {
  for (const name of new Set([entry.name, ...entry.sources.map(source => source.name)].map(normalizeMaterialText))) {
    entriesByName.set(name, [...(entriesByName.get(name) || []), entry]);
  }
}

/** Only reviewed aliases, never edit distance. Digits, units and brands matter. */
export function findMaterialEntry(item: { code?: string; name: string; unit?: string; brand?: string }): MaterialCatalogEntry | undefined {
  const candidates = entriesByName.get(normalizeMaterialText(item.name)) || [];
  return candidates.find(entry => {
    if (item.unit && normalizeMaterialText(item.unit) !== normalizeMaterialText(entry.unit)) return false;
    const names = [entry.name, ...entry.sources.map(source => source.name)];
    if (item.brand?.trim() && !names.some(n => normalizeMaterialText(n).includes(normalizeMaterialText(item.brand)))) return false;
    return true;
  });
}

export function matchesPartSearch(item: PartItem, query: string) {
  const q = normalizeMaterialText(query);
  return !q || [item.name, item.code, item.alias, ...(item.catalogAliases || [])]
    .some(value => normalizeMaterialText(value || '').includes(q));
}

export function sameReviewedMaterial(a: { name: string; code?: string; unit?: string }, b: { name: string; code?: string; unit?: string }) {
  if (!a.unit || !b.unit || normalizeMaterialText(a.unit) !== normalizeMaterialText(b.unit)) return false;
  const first = findMaterialEntry(a), second = findMaterialEntry(b);
  return !!first && first.code === second?.code;
}

export type MaterialImportPlan = {
  records: PartItem[];
  added: number;
  updated: number;
  archived: number;
  warnings: string[];
};

export function planMaterialImport(current: PartItem[]): MaterialImportPlan {
  const ids = new Set<number>();
  current.forEach(item => {
    if (!Number.isSafeInteger(item.id) || ids.has(item.id)) throw new Error('شناسه تکراری یا نامعتبر در فهرست فعلی وجود دارد؛ ابتدا فهرست فعلی بررسی شود.');
    ids.add(item.id);
  });
  let nextId = Math.max(0, ...current.map(item => item.id)) + 1;
  const result: MaterialImportPlan = { records: current.map(item => ({ ...item })), added: 0, updated: 0, archived: 0, warnings: [] };
  for (const entry of MATERIAL_CATALOG) {
    const candidates = result.records.filter(item => !item.mergedInto && findMaterialEntry(item)?.code === entry.code);
    const codeConflict = result.records.find(item => !item.mergedInto && entry.sources.some(s => normalizeMaterialText(s.code) === normalizeMaterialText(item.code)) && findMaterialEntry(item)?.code !== entry.code);
    if (codeConflict) {
      result.warnings.push(`کد ${codeConflict.code}: مشخصات «${codeConflict.name}» با فهرست ارسالی یکسان نیست؛ بدون تغییر باقی ماند (${entry.name}).`);
      continue;
    }
    const price = Math.max(entry.price, ...candidates.map(item => Number(item.price) || 0));
    const chosen = candidates.find(item => item.code === entry.code) || [...candidates].sort((a, b) => b.price - a.price || a.id - b.id)[0];
    const aliases = [...new Set([
      entry.code, entry.name,
      ...entry.sources.flatMap(s => [s.code, s.name]),
      ...candidates.flatMap(item => [item.code, item.name, ...(item.catalogAliases || [])]),
    ])].sort();
    if (!chosen) {
      result.records.push({ id: nextId++, code: entry.code, name: entry.name, unit: entry.unit,
        price, stock: 0, minimumStock: 0, alias: '', brand: '', country: '', desc: '', consumable: true,
        catalogAliases: aliases, catalogRevision: MATERIAL_CATALOG_VERSION });
      result.added++;
      continue;
    }
    const updated: PartItem = { ...chosen, code: entry.code, name: entry.name, price,
      catalogAliases: aliases, catalogRevision: MATERIAL_CATALOG_VERSION };
    if (JSON.stringify(chosen) !== JSON.stringify(updated)) {
      result.records[result.records.findIndex(item => item.id === chosen.id)] = updated;
      result.updated++;
    }
    for (const duplicate of candidates.filter(item => item.id !== chosen.id)) {
      // Never guess whether stock on duplicate records represents the same physical goods.
      if (Number(duplicate.stock) !== 0 || Number(duplicate.minimumStock || 0) !== 0) {
        result.warnings.push(`«${duplicate.name}» (${duplicate.code}) دارای موجودی/حداقل موجودی است؛ برای انبارگردانی جدا نگه داشته شد.`);
        continue;
      }
      result.records[result.records.findIndex(item => item.id === duplicate.id)] = { ...duplicate, mergedInto: chosen.id };
      result.archived++;
    }
  }
  return result;
}

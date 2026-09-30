/**
 * Helpers for the mobile map: «ساختمان‌های نزدیک من».
 *
 * Rules that keep the map light and honest:
 *  - only REAL registered coordinates are ever placed on the map (no invented positions);
 *  - the amount of work and of DOM is bounded by `limit`, never by the number of contracts;
 *  - pins and the optional OpenStreetMap tiles use the same Web-Mercator projection, so they always line up.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371000;
/** Circumference of the Web-Mercator world in metres at the equator (what the OSM tile grid is based on). */
const WORLD_METERS = 40075016.686;
const MAX_LAT = 85.0511287798;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/* ------------------------------ ranking / filtering ------------------------------ */

export type MapFilterMode = "nearby" | "registered" | "pending" | "all";

export interface MapRow {
  id: number;
  /** Registered coordinates; `null` when the building has no GPS yet (it is never drawn or navigated to). */
  lat: number | null;
  lng: number | null;
  pending: boolean;
  /** Lower-cased text the search box looks in (name, contract number, manager, address). */
  search: string;
  name: string;
}

export interface MapPick {
  id: number;
  registered: boolean;
  distanceM: number | null;
}

export interface MapSelection {
  /** The first `limit` buildings, nearest first. */
  picks: MapPick[];
  /** How many buildings match in total (before the limit). */
  total: number;
  /** True when a search text replaced the chip filter (the search always looks at every building). */
  searched: boolean;
}

const collator = new Intl.Collator("fa");

/**
 * Chooses which buildings the map shows.
 *  - a non-empty `query` searches every building, whatever the chip says;
 *  - `nearby` keeps buildings with registered GPS inside `radiusM` of the user (needs `origin`);
 *  - `registered` / `pending` / `all` are the old filters, now bounded by `limit`;
 *  - with a known position the result is ordered nearest first (buildings without GPS follow, by name).
 */
export function selectMapBuildings(
  rows: MapRow[],
  options: { mode: MapFilterMode; query?: string; origin: LatLng | null; radiusM: number; limit: number },
): MapSelection {
  const query = (options.query || "").trim().toLowerCase();
  const { origin, radiusM } = options;
  const limit = Math.max(0, Math.floor(options.limit));
  const searched = query.length > 0;

  type Scored = { row: MapRow; distanceM: number | null };
  const kept: Scored[] = [];
  for (const row of rows) {
    const registered = row.lat !== null && row.lng !== null;
    const distanceM = origin && registered ? haversineMeters(origin, { lat: row.lat as number, lng: row.lng as number }) : null;
    if (searched) {
      if (!row.search.includes(query)) continue;
    } else if (options.mode === "nearby") {
      if (distanceM === null || distanceM > radiusM) continue;
    } else if (options.mode === "registered") {
      if (!registered) continue;
    } else if (options.mode === "pending") {
      if (!row.pending) continue;
    }
    kept.push({ row, distanceM });
  }

  kept.sort((a, b) => {
    if (a.distanceM !== null && b.distanceM !== null) return a.distanceM - b.distanceM;
    if (a.distanceM !== null) return -1; // located first
    if (b.distanceM !== null) return 1;
    const aRegistered = a.row.lat !== null;
    const bRegistered = b.row.lat !== null;
    if (aRegistered !== bRegistered) return aRegistered ? -1 : 1;
    return collator.compare(a.row.name, b.row.name) || a.row.id - b.row.id;
  });

  return {
    picks: kept.slice(0, limit).map(({ row, distanceM }) => ({
      id: row.id,
      registered: row.lat !== null && row.lng !== null,
      distanceM: distanceM === null ? null : Math.round(distanceM),
    })),
    total: kept.length,
    searched,
  };
}

/** How many buildings (and how many of them still owe last month's service) are within `radiusM` of `origin`. */
export function countWithin(rows: MapRow[], origin: LatLng, radiusM: number): { total: number; pending: number } {
  let total = 0;
  let pending = 0;
  for (const row of rows) {
    if (row.lat === null || row.lng === null) continue;
    if (haversineMeters(origin, { lat: row.lat, lng: row.lng }) > radiusM) continue;
    total++;
    if (row.pending) pending++;
  }
  return { total, pending };
}

/* --------------------------------- projection --------------------------------- */

/** A square window on the map: centre + half of its side length in metres. */
export interface MapView {
  centerLat: number;
  centerLng: number;
  halfSpanM: number;
}

const worldX = (lng: number) => (lng + 180) / 360;
const worldY = (lat: number) => {
  const sin = Math.sin(toRad(clamp(lat, -MAX_LAT, MAX_LAT)));
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

/** Side of the window in "world" units (1 = whole Web-Mercator world). */
const viewSizeWorld = (view: MapView) => (2 * view.halfSpanM) / (WORLD_METERS * Math.cos(toRad(view.centerLat)));

export const viewAround = (center: LatLng, halfSpanM: number): MapView => ({ centerLat: center.lat, centerLng: center.lng, halfSpanM });

/** A window that contains every point (with some padding); never smaller than `minHalfSpanM`. */
export function viewFitting(points: LatLng[], options: { fallback: LatLng; minHalfSpanM?: number; padding?: number }): MapView {
  const minHalf = options.minHalfSpanM ?? 250;
  if (points.length === 0) return viewAround(options.fallback, Math.max(minHalf, 1500));
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const metersPerDegree = (Math.PI / 180) * EARTH_RADIUS_M;
  const spanX = (maxLng - minLng) * metersPerDegree * Math.cos(toRad(centerLat));
  const spanY = (maxLat - minLat) * metersPerDegree;
  const half = (Math.max(spanX, spanY) / 2) * (1 + (options.padding ?? 0.25));
  return { centerLat, centerLng, halfSpanM: Math.max(minHalf, half) };
}

/** Position of a coordinate inside the square window, in percent (x to the right, y downwards). */
export function projectToView(view: MapView, lat: number, lng: number): { x: number; y: number } {
  const size = viewSizeWorld(view);
  const left = worldX(view.centerLng) - size / 2;
  const top = worldY(view.centerLat) - size / 2;
  return { x: ((worldX(lng) - left) / size) * 100, y: ((worldY(lat) - top) / size) * 100 };
}

/** Diameter, in percent of the window side, of a circle of `radiusM` metres. */
export const ringDiameterPercent = (view: MapView, radiusM: number) => (radiusM / view.halfSpanM) * 100;

/* ----------------------------- OpenStreetMap tiles ----------------------------- */

export interface TileSpec {
  key: string;
  src: string;
  /** Percent of the square window. */
  left: number;
  top: number;
  size: number;
}

/**
 * The few (at most `maxTiles`) 256-px OSM tiles that cover the window. They are positioned in percent, so they scale with
 * the window and line up exactly with `projectToView`.
 */
export function tilesForView(view: MapView, canvasPx: number, pixelRatio = 1, maxTiles = 16): TileSpec[] {
  const size = viewSizeWorld(view);
  const cx = worldX(view.centerLng);
  const cy = worldY(view.centerLat);
  const left = cx - size / 2;
  const top = cy - size / 2;
  const wanted = Math.round(Math.log2((Math.max(120, canvasPx) * clamp(pixelRatio, 1, 2)) / (size * 256)));
  for (let zoom = clamp(wanted, 2, 18); zoom >= 2; zoom--) {
    const n = 2 ** zoom;
    const x0 = Math.floor(left * n), x1 = Math.floor((left + size) * n);
    const y0 = Math.max(0, Math.floor(top * n)), y1 = Math.min(n - 1, Math.floor((top + size) * n));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > maxTiles && zoom > 2) continue;
    const tiles: TileSpec[] = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const wrappedX = ((tx % n) + n) % n;
        tiles.push({
          key: `${zoom}/${wrappedX}/${ty}@${tx}`,
          src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`,
          left: ((tx / n - left) / size) * 100,
          top: ((ty / n - top) / size) * 100,
          size: (1 / n / size) * 100,
        });
      }
    }
    return tiles;
  }
  return [];
}

/** Short Persian label for a distance («۱۲۰ متر» / «۱٫۴ کیلومتر»). */
export function formatDistanceFa(meters: number): string {
  if (meters < 1000) return `${Math.round(meters).toLocaleString("fa-IR")} متر`;
  return `${(meters / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} کیلومتر`;
}

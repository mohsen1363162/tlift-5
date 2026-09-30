import { memo, useMemo } from "react";
import {
  projectToView,
  ringDiameterPercent,
  tilesForView,
  type MapView,
} from "../../utils/nearbyMap";

/**
 * The drawing part of the mobile map. It is deliberately cheap:
 *  - at most a few dozen pins (the parent bounds them), each one a plain element: no blur, no shadow stack, no animation;
 *  - the OpenStreetMap base is a handful of tile images placed with the SAME projection as the pins
 *    (the old full-page iframe reloaded on every tap and never lined up with the pins);
 *  - it is wrapped in React.memo and gets stable props, so the once-per-second tick of the mobile app does not repaint it.
 */

export interface MapPinData {
  id: number;
  lat: number;
  lng: number;
  /** Services still owed for last month (0 or 1). */
  pending: number;
  label: string;
  distanceLabel: string | null;
}

interface PinProps {
  pin: MapPinData;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: number) => void;
}

const Pin = memo(function Pin({ pin, x, y, selected, onSelect }: PinProps) {
  const tone = selected ? "bg-violet-700" : pin.pending > 0 ? "bg-amber-500" : "bg-emerald-600";
  return (
    <button
      type="button"
      data-map-pin={pin.id}
      aria-label={`${pin.label}${pin.distanceLabel ? ` — ${pin.distanceLabel}` : ""}`}
      aria-pressed={selected}
      onClick={() => onSelect(pin.id)}
      style={{ left: `${x}%`, top: `${y}%`, zIndex: selected ? 30 : pin.pending > 0 ? 20 : 10 }}
      className="absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
    >
      <span
        className={`flex items-center justify-center rounded-full border-2 border-white text-[10px] font-black leading-none text-white ${tone} ${
          selected ? "h-7 w-7 ring-4 ring-violet-400/40" : "h-5 w-5"
        }`}
      >
        {pin.pending > 0 ? pin.pending.toLocaleString("fa-IR") : "✓"}
      </span>
      {selected && (
        <span className="pointer-events-none absolute bottom-full mb-1 max-w-[180px] truncate whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white">
          {pin.label}
          {pin.distanceLabel ? ` · ${pin.distanceLabel}` : ""}
        </span>
      )}
    </button>
  );
});

export interface MapCanvasProps {
  view: MapView;
  pins: MapPinData[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  userLat: number | null;
  userLng: number | null;
  /** When set, two dashed distance rings (radius and half of it) are drawn around the user. */
  ringRadiusM: number | null;
  showTiles: boolean;
}

const ringLabel = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} کم` : `${meters.toLocaleString("fa-IR")} م`;

function MapCanvas({ view, pins, selectedId, onSelect, userLat, userLng, ringRadiusM, showTiles }: MapCanvasProps) {
  const tiles = useMemo(() => {
    if (!showTiles) return [];
    const width = typeof window === "undefined" ? 390 : Math.min(window.innerWidth || 390, 560);
    const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    return tilesForView(view, width, ratio);
  }, [view, showTiles]);

  const placed = useMemo(() => pins.map((pin) => ({ pin, ...projectToView(view, pin.lat, pin.lng) })), [pins, view]);
  const user = userLat !== null && userLng !== null ? projectToView(view, userLat, userLng) : null;
  const userVisible = !!user && user.x >= -2 && user.x <= 102 && user.y >= -2 && user.y <= 102;

  return (
    <div className="absolute inset-0 overflow-hidden" data-map-canvas="">
      {tiles.map((tile) => (
        <img
          key={tile.key}
          src={tile.src}
          alt=""
          draggable={false}
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
          style={{ left: `${tile.left}%`, top: `${tile.top}%`, width: `${tile.size}%`, height: `${tile.size}%` }}
          className="pointer-events-none absolute max-w-none select-none"
        />
      ))}

      {user && userVisible && ringRadiusM && (
        <>
          {[ringRadiusM, ringRadiusM / 2].map((radius, index) => {
            const size = ringDiameterPercent(view, radius);
            return (
              <span
                key={radius}
                data-map-ring={index === 0 ? "outer" : "inner"}
                style={{ left: `${user.x}%`, top: `${user.y}%`, width: `${size}%`, height: `${size}%` }}
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-blue-600/60"
              >
                <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded bg-white px-1 text-[8px] font-bold text-blue-700">
                  {ringLabel(radius)}
                </span>
              </span>
            );
          })}
        </>
      )}

      {placed.map(({ pin, x, y }) => (
        <Pin key={pin.id} pin={pin} x={x} y={y} selected={selectedId === pin.id} onSelect={onSelect} />
      ))}

      {user && userVisible && (
        <span
          data-map-user=""
          style={{ left: `${user.x}%`, top: `${user.y}%`, zIndex: 40 }}
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        >
          <span className="h-4 w-4 rounded-full border-2 border-white bg-blue-600 ring-4 ring-blue-500/30" />
          <span className="absolute top-5 whitespace-nowrap rounded bg-blue-900 px-1.5 py-0.5 text-[8.5px] font-bold text-white">شما اینجایید</span>
        </span>
      )}

      {showTiles && tiles.length > 0 && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-1 right-1 z-20 rounded bg-white/90 px-1 py-0.5 text-[8px] text-slate-600"
        >
          © OpenStreetMap
        </a>
      )}
    </div>
  );
}

export default memo(MapCanvas);

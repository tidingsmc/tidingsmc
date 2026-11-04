import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import { AddonIcon } from "../AddonIcon";
import { readMap, type MapBlock, type MapLayout } from "../../lib/addons";
import { useImage } from "../../lib/images";
import type { BlockContext } from "./context";

const MAP_ZOOMS = [1, 2, 4];

const markerKey = (m: MapLayout["markers"][number]) =>
  JSON.stringify([m.label, m.link]);

export function MapView({
  block,
  context,
}: {
  block: MapBlock;
  context: BlockContext;
}) {
  const { t } = useTranslation();

  const map = useMemo(() => readMap(block), [block]);
  const background = useImage(map?.background ?? null);
  const [zoom, setZoom] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const center = useRef<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const at = center.current;
    if (!el || !at) return;
    center.current = null;
    el.scrollLeft = at.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = at.y * el.scrollHeight - el.clientHeight / 2;
  }, [zoom]);

  if (!map) return null;
  const marker =
    selected === null
      ? undefined
      : map.markers.find((m) => markerKey(m) === selected);
  const zoomTo = (next: number) => {
    const el = scrollerRef.current;
    if (el)
      center.current = {
        x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
        y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
      };
    setZoom(next);
  };
  const scale = MAP_ZOOMS[zoom];
  const ratio = map.width / map.height;
  return (
    <div className="addon-map">
      <div className="addon-map-frame">
        <div
          ref={scrollerRef}
          className="addon-map-scroller"
          role="group"
          aria-label={t("addon.map")}
        >
          <div
            className="addon-map-canvas"
            style={{
              width: `min(${scale * 100}%, ${scale * ratio * 70}vh)`,
              aspectRatio: `${map.width} / ${map.height}`,
            }}
          >
            {background && (
              <img className="addon-map-background" src={background} alt="" />
            )}
            {map.areas.map((area, i) => (
              <div
                key={i}
                className="addon-map-area"
                style={{
                  left: `${area.left}%`,
                  top: `${area.top}%`,
                  width: `${area.width}%`,
                  height: `${area.height}%`,
                }}
              />
            ))}
            {map.markers.map((m, i) => {
              const key = markerKey(m);
              return (
                <button
                  key={i}
                  type="button"
                  className="addon-map-marker"
                  data-icon={m.icon !== undefined || undefined}
                  aria-pressed={m === marker}
                  aria-label={m.label || t("addon.marker")}
                  title={m.label || undefined}
                  style={{ left: `${m.left}%`, top: `${m.top}%` }}
                  onClick={() => setSelected(m === marker ? null : key)}
                >
                  {m.icon !== undefined && <AddonIcon name={m.icon} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="addon-map-bar">
        <p className="addon-map-label" aria-live="polite">
          {marker &&
            (marker.link ? (
              <a href={context.href(marker.link)}>{marker.label}</a>
            ) : (
              marker.label
            ))}
        </p>
        <div className="addon-map-zoom">
          <button
            type="button"
            className="icon-button"
            aria-label={t("addon.zoomOut")}
            disabled={zoom === 0}
            onClick={() => zoomTo(zoom - 1)}
          >
            <ZoomOut />
          </button>
          <span className="small" aria-live="polite">
            {scale}×
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label={t("addon.zoomIn")}
            disabled={zoom === MAP_ZOOMS.length - 1}
            onClick={() => zoomTo(zoom + 1)}
          >
            <ZoomIn />
          </button>
        </div>
      </div>
    </div>
  );
}

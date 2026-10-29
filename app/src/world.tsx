import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Cloud, Sun, Zap } from "pixelarticons/react";
import { useTranslation } from "react-i18next";
import type { WorldInfo } from "./lib/api";

function hourOf(dayTime: number): number {
  return (dayTime / 1000 + 6) % 24;
}

function clock(dayTime: number): string {
  const hour = hourOf(dayTime);
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const WEATHER_ICONS = {
  clear: <Sun />,
  rain: <Cloud />,
  thunder: <Zap />,
};

const SKY: [hour: number, top: string, bottom: string][] = [
  [0, "#0b1026", "#1c2550"],
  [4.5, "#141a3d", "#2b3166"],
  [5.5, "#3a3f7a", "#e0875a"],
  [7, "#4b8fd8", "#f2c48d"],
  [9, "#3f86d6", "#9fd0f7"],
  [16, "#4a8bd6", "#b6dcf7"],
  [18, "#4d4f93", "#f39a5b"],
  [19.5, "#25275a", "#a8506a"],
  [21, "#111633", "#232a58"],
  [24, "#0b1026", "#1c2550"],
];

function parseHex(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function mix(a: string, b: string, t: number): string {
  const [ca, cb] = [parseHex(a), parseHex(b)];
  return (
    "#" +
    ca
      .map((v, i) =>
        Math.round(v + (cb[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function skyAt(hour: number, weather: WorldInfo["weather"]): [string, string] {
  const i = SKY.findIndex(([h]) => h > hour);
  const [h0, top0, bottom0] = SKY[i - 1];
  const [h1, top1, bottom1] = SKY[i];
  const t = (hour - h0) / (h1 - h0);
  const top = mix(top0, top1, t);
  const bottom = mix(bottom0, bottom1, t);
  if (weather === "clear") return [top, bottom];
  // Rain greys the sky out, thunder darkens it.
  const [grey, amount] =
    weather === "rain" ? ["#5d6573", 0.55] : ["#2a2e36", 0.7];
  return [mix(top, grey, amount), mix(bottom, grey, amount)];
}

function celestialPosition(dayTime: number): {
  sunUp: boolean;
  style: CSSProperties;
} {
  const sunUp = dayTime >= 23000 || dayTime < 13000;
  const progress = sunUp
    ? ((dayTime + 1000) % 24000) / 14000
    : (dayTime - 13000) / 10000;
  return {
    sunUp,
    style: {
      left: `${8 + progress * 84}%`,
      top: `${72 - Math.sin(Math.PI * progress) * 50}%`,
    },
  };
}

function useLiveWorld(world: WorldInfo, receivedAt: number): WorldInfo {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const ticks =
    world.day * 24000 +
    world.dayTime +
    Math.max(0, Math.floor((now - receivedAt) / 50));
  return { ...world, dayTime: ticks % 24000, day: Math.floor(ticks / 24000) };
}

function PixelSun() {
  return (
    <svg
      viewBox="0 0 48 48"
      width={48}
      height={48}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x={6} y={6} width={36} height={36} fill="#ffd966" />
      <rect x={10} y={10} width={28} height={28} fill="#fff8c9" />
    </svg>
  );
}

const CRATERS = [
  [2, 2],
  [3, 2],
  [6, 1],
  [1, 5],
  [5, 5],
  [6, 5],
  [5, 6],
  [8, 4],
  [3, 8],
  [7, 8],
];

function PixelMoon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={48}
      height={48}
      shapeRendering="crispEdges"
      aria-hidden
    >
      <rect x={3} y={3} width={10} height={10} fill="#dfe6f2" />
      {CRATERS.map(([x, y]) => (
        <rect
          key={`${x},${y}`}
          x={3 + x}
          y={3 + y}
          width={1}
          height={1}
          fill="#b3bccd"
        />
      ))}
    </svg>
  );
}

const CLOUD_SHAPES: [x: number, y: number, width: number][][] = [
  [
    [3, 0, 5],
    [0, 1, 13],
    [2, 2, 9],
  ],
  [
    [1, 0, 4],
    [7, 0, 3],
    [0, 1, 12],
    [3, 2, 6],
  ],
  [
    [0, 0, 7],
    [1, 1, 9],
  ],
];
const CLOUDS = [
  { shape: 0, top: 6, duration: 140, start: 0.15 },
  { shape: 2, top: 26, duration: 190, start: 0.55 },
  { shape: 1, top: 12, duration: 160, start: 0.8 },
];

function Clouds({ sky }: { sky: string }) {
  const color = mix("#ffffff", sky, 0.35);
  return (
    <>
      {CLOUDS.map((cloud, i) => (
        <span
          key={i}
          className="world-cloud"
          style={{
            top: cloud.top,
            animationDuration: `${cloud.duration}s`,
            animationDelay: `${-cloud.start * cloud.duration}s`,
          }}
        >
          <svg
            width={13 * 4}
            height={3 * 4}
            viewBox="0 0 13 3"
            shapeRendering="crispEdges"
            aria-hidden
          >
            {CLOUD_SHAPES[cloud.shape].map(([x, y, width]) => (
              <rect
                key={`${x},${y}`}
                x={x}
                y={y}
                width={width}
                height={1}
                fill={color}
              />
            ))}
          </svg>
        </span>
      ))}
    </>
  );
}

function Rain({ heavy }: { heavy: boolean }) {
  const drops = useMemo(() => {
    let seed = heavy ? 11 : 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: heavy ? 48 : 30 }, () => {
      const near = random() < 0.4;
      const duration =
        (near ? 0.5 : 0.8) * (heavy ? 0.75 : 1) + random() * 0.15;
      return {
        near,
        style: {
          left: `${random() * 100}%`,
          animationDuration: `${duration}s`,
          animationDelay: `${-random() * duration}s`,
          "--y": `${Math.round(random() * 80)}px`,
        } as CSSProperties,
      };
    });
  }, [heavy]);

  return (
    <span className="world-rain">
      {drops.map((drop, i) => (
        <span
          key={i}
          className={drop.near ? "drop near" : "drop"}
          style={drop.style}
        />
      ))}
    </span>
  );
}

export function WorldCard({
  world: polled,
  receivedAt,
}: {
  world: WorldInfo;
  receivedAt: number;
}) {
  const { t } = useTranslation();
  const world = useLiveWorld(polled, receivedAt);
  const hour = hourOf(world.dayTime);
  const [top, bottom] = skyAt(hour, world.weather);
  const { sunUp, style } = celestialPosition(world.dayTime);
  const weather = Object.prototype.hasOwnProperty.call(
    WEATHER_ICONS,
    world.weather,
  )
    ? world.weather
    : "clear";

  return (
    <section className="world" aria-label={t("world.label")}>
      <div
        className="world-sky"
        style={{ background: `linear-gradient(${top}, ${bottom})` }}
      >
        {!sunUp && world.weather === "clear" && (
          <span className="world-stars" />
        )}
        <span
          key={sunUp ? "sun" : "moon"}
          className={`world-celestial ${sunUp ? "sun" : "moon"}`}
          style={style}
        >
          {sunUp ? <PixelSun /> : <PixelMoon />}
        </span>
        <Clouds sky={top} />
        {world.weather !== "clear" && (
          <Rain heavy={world.weather === "thunder"} />
        )}
        {world.weather === "thunder" && <span className="world-flash" />}
        <span className="world-ground" />
      </div>
      <div className="world-info">
        <div className="world-now">
          <span className="world-time">{clock(world.dayTime)}</span>
          <span className="world-sub">
            {WEATHER_ICONS[weather]} {t(`world.${weather}`)}
          </span>
        </div>
        <div className="world-day">{t("world.day", { day: world.day })}</div>
      </div>
    </section>
  );
}

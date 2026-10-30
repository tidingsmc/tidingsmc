import type { MotdSegment } from "../lib/api";

const MC_COLORS: Record<string, string> = {
  black: "#000000",
  dark_blue: "#0000AA",
  dark_green: "#00AA00",
  dark_aqua: "#00AAAA",
  dark_red: "#AA0000",
  dark_purple: "#AA00AA",
  gold: "#FFAA00",
  gray: "#AAAAAA",
  dark_gray: "#555555",
  blue: "#5555FF",
  green: "#55FF55",
  aqua: "#55FFFF",
  red: "#FF5555",
  light_purple: "#FF55FF",
  yellow: "#FFFF55",
  white: "#FFFFFF",
};

function mcColor(color?: string): string | undefined {
  if (!color) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return MC_COLORS[color];
}

export function Motd({ segments }: { segments: MotdSegment[] }) {
  return (
    <p className="motd">
      {segments.map((s, i) => (
        <span
          key={i}
          style={{
            color: mcColor(s.color),
            fontWeight: s.bold ? 700 : undefined,
            fontStyle: s.italic ? "italic" : undefined,
            textDecoration:
              [s.underlined && "underline", s.strikethrough && "line-through"]
                .filter(Boolean)
                .join(" ") || undefined,
          }}
        >
          {s.text}
        </span>
      ))}
    </p>
  );
}

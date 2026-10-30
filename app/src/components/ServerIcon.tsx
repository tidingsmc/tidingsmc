import { hashString } from "../lib/util";

export function ServerIcon({
  name,
  icon,
  size = 48,
}: {
  name: string;
  icon?: string;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (icon?.startsWith("data:image/png;base64,")) {
    return <img className="server-icon" src={icon} alt="" style={style} />;
  }
  return (
    <span
      className="server-icon letter"
      style={{
        ...style,
        background: `hsl(${hashString(name) % 360} 40% 38%)`,
        fontSize: size / 2,
      }}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

import { useEffect, useState } from "react";
import { Layout } from "pixelarticons/react";
import { readIcon } from "../lib/icons";

const loaded = new Map<string, string>();

export function AddonIcon({
  name,
  className,
}: {
  name?: unknown;
  className?: string;
}) {
  const icon = readIcon(name);
  const iconName = icon.kind === "name" ? icon.name : null;
  const [svg, setSvg] = useState<string | null | undefined>(() =>
    iconName ? loaded.get(iconName) : undefined,
  );

  useEffect(() => {
    if (!iconName) return;
    const cached = loaded.get(iconName);
    if (cached) return setSvg(cached);
    setSvg(undefined);
    let cancelled = false;
    import("../lib/pixelarticons")
      .then(({ loadSvg }) => loadSvg(iconName) ?? Promise.resolve(null))
      .then(
        (text) => {
          if (text !== null) loaded.set(iconName, text);
          if (!cancelled) setSvg(text);
        },
        () => !cancelled && setSvg(null),
      );
    return () => {
      cancelled = true;
    };
  }, [iconName]);

  const classes = ["addon-icon", className].filter(Boolean).join(" ");
  if (icon.kind === "image") {
    return <img className={`${classes} image`} src={icon.src} alt="" />;
  }
  if (svg === null) return <Layout className={classes} aria-hidden />;
  if (svg === undefined)
    return <svg className={classes} viewBox="0 0 24 24" aria-hidden />;
  return (
    <span
      className={`${classes} named`}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

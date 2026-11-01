const DIR = "/node_modules/pixelarticons/svg/";
const SVGS = import.meta.glob<string>("/node_modules/pixelarticons/svg/*.svg", {
  query: "?raw",
  import: "default",
});

export function loadSvg(name: string): Promise<string> | null {
  return SVGS[`${DIR}${name}.svg`]?.() ?? null;
}

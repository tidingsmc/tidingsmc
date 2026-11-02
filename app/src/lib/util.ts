import type { TFunction } from "i18next";

export function hashString(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Only accepts Mojang's skin server, and always over HTTPS
 * (game profiles list skins as http://, which a secure page can't load)
 */
export function safeSkinUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.hostname !== "textures.minecraft.net") return undefined;
    u.protocol = "https:";
    return u.href;
  } catch {
    return undefined;
  }
}

export function currentTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** User-Agent Client Hints: only in Chromium browsers, and not in TypeScript's DOM types yet */
interface UserAgentData {
  brands: { brand: string; version: string }[];
  mobile: boolean;
  platform: string;
  getHighEntropyValues(hints: string[]): Promise<{ model?: string }>;
}

/**
 * A name for this device, shown in game when it asks to pair and in /tidings devices: the phone's
 * model where the browser tells it (Chromium on Android), the browser and system on a computer
 */
export async function defaultDeviceName(t: TFunction): Promise<string> {
  const ua = navigator.userAgent;
  const hints = (navigator as { userAgentData?: UserAgentData }).userAgentData;
  if (hints?.mobile) {
    const model = await hints
      .getHighEntropyValues(["model"])
      .then((values) => values.model?.trim())
      .catch(() => undefined);
    // Samsung only gives its model number ("SM-S931B"): the brand makes it recognizable
    if (model) return /^SM-/.test(model) ? `Samsung ${model}` : model;
  }
  if (/iPhone/.test(ua)) return t("device.iPhone");
  if (/iPad/.test(ua)) return t("device.iPad");
  if (/Android/.test(ua)) return t("device.android");
  const browser = browserName(ua, hints);
  const os = osName(ua);
  return browser && os
    ? t("device.browserOn", { browser, os })
    : t("device.browser");
}

function browserName(ua: string, hints?: UserAgentData): string | undefined {
  // Chromium lists itself and made-up brands ("Not A;Brand") next to the real one
  const brand = hints?.brands.find(
    (b) => !/Chromium|Not.?A.?Brand/i.test(b.brand),
  )?.brand;
  if (brand) return brand.replace(/^Google /, "");
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return undefined;
}

function osName(ua: string): string | undefined {
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Linux/.test(ua)) return "Linux";
  return undefined;
}

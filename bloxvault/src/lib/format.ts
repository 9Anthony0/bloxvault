export function compact(n: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: n < 10_000 ? 1 : 0 }).format(n);
}

export function relativeTime(iso: string | null) {
  if (!iso) return "unknown";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Infinity, "year"],
  ];
  let v = diff;
  for (const [step, unit] of units) {
    if (Math.abs(v) < step) return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(-Math.round(v), unit);
    v /= step;
  }
  return "";
}

export function sourcePlatform(url: string | null): { label: string; short: string } | null {
  if (!url) return null;
  if (/instagram\.com/i.test(url)) return { label: "Instagram Reel", short: "IG" };
  if (/tiktok\.com/i.test(url)) return { label: "TikTok", short: "TT" };
  if (/youtu\.?be/i.test(url)) return { label: "YouTube Short", short: "YT" };
  try {
    return { label: new URL(url).hostname.replace(/^www\./, ""), short: "↗" };
  } catch {
    return { label: "Source", short: "↗" };
  }
}

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Today's date as YYYY-MM-DD in the user's local timezone (toISOString would give UTC). */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

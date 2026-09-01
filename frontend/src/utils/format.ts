// Formatting helpers — tabular money & distance (USD + miles).
export const money = (n: number | null | undefined, dp = 2): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return "$0.00";
  return `$${Number(n).toFixed(dp)}`;
};

export const moneyWhole = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return "$0";
  return `$${Math.round(Number(n))}`;
};

export const miles = (n: number | null | undefined, dp = 1): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return "0 mi";
  return `${Number(n).toFixed(dp)} mi`;
};

export const minutesLabel = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return "0 min";
  return `${Math.round(Number(n))} min`;
};

export const perMile = (n: number | null | undefined): string => `${money(n)}/mi`;
export const perHour = (n: number | null | undefined): string => `${money(n)}/hr`;

export const pct = (n: number | null | undefined): string => {
  if (n === null || n === undefined || isNaN(Number(n))) return "0%";
  return `${Math.round(Number(n) * 100)}%`;
};

// seconds -> "3h 14m"
export const duration = (sec: number | null | undefined): string => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const platformLabel = (p?: string | null): string => {
  switch (p) {
    case "doordash":
      return "DoorDash";
    case "grubhub":
      return "Grubhub";
    case "uber_eats":
    default:
      return "Uber Eats";
  }
};

export const relTime = (iso?: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// GigVerdict design tokens — dark automotive/trading dashboard.
// Sourced from /app/design_guidelines.json (Personality 7: Dark-First Utility).

export const colors = {
  surface: "#0D0E12",
  onSurface: "#F2F4F7",
  surfaceSecondary: "#1A1D24",
  onSurfaceSecondary: "#A0AAB5",
  surfaceTertiary: "#262A33",
  onSurfaceTertiary: "#C0C8D1",
  surfaceInverse: "#F2F4F7",
  onSurfaceInverse: "#0D0E12",

  brand: "#FFB020",
  brandPrimary: "#FFB020",
  onBrandPrimary: "#1A1100",
  brandSecondary: "#CC8C1A",
  brandTertiary: "#332306",
  onBrandTertiary: "#FFD980",

  success: "#00E676",
  onSuccess: "#00331A",
  successTint: "rgba(0,230,118,0.14)",
  warning: "#FFC400",
  onWarning: "#332700",
  warningTint: "rgba(255,196,0,0.14)",
  error: "#FF3D00",
  onError: "#330C00",
  errorTint: "rgba(255,61,0,0.14)",
  info: "#00B0FF",
  onInfo: "#002333",

  border: "#2E3440",
  borderStrong: "#4C566A",
  divider: "#20242C",
};

// Verdict color mapping
export const verdictColor = (v: string) => {
  if (v === "take") return colors.success;
  if (v === "maybe") return colors.warning;
  return colors.error;
};
export const verdictTint = (v: string) => {
  if (v === "take") return colors.successTint;
  if (v === "maybe") return colors.warningTint;
  return colors.errorTint;
};
export const verdictLabel = (v: string) => {
  if (v === "take") return "TAKE IT";
  if (v === "maybe") return "MAYBE";
  return "DECLINE";
};

export const zoneColor = (t: string) => {
  if (t === "hot") return colors.success;
  if (t === "dead") return colors.error;
  return colors.onSurfaceSecondary;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

// Font families registered in _layout via expo-font
export const fonts = {
  display: "BarlowCondensed-Bold",
  displaySemi: "BarlowCondensed-SemiBold",
  displayMedium: "BarlowCondensed-Medium",
  body: "DMSans-Regular",
  bodyMedium: "DMSans-Medium",
  bodyBold: "DMSans-Bold",
};

export const fontSize = {
  sm: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 48,
  "5xl": 64,
};

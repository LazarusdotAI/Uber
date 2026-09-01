import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "@/src/api/client";
import { Card, SectionTitle, Pill } from "@/src/components/ui";
import {
  colors,
  spacing,
  radius,
  fonts,
  fontSize,
  verdictColor,
  verdictLabel,
} from "@/src/theme/tokens";
import { money, perMile, perHour, duration, relTime, platformLabel } from "@/src/utils/format";

const TABS = ["offers", "shifts", "restaurants", "time"] as const;
const TAB_LABEL: Record<string, string> = {
  offers: "Offers",
  shifts: "Shifts",
  restaurants: "Restaurants",
  time: "Time",
};

export default function History() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]>("offers");
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [timeData, setTimeData] = useState<any>(null);

  const load = useCallback(async (which: string) => {
    setLoading(true);
    try {
      if (which === "offers") setOffers((await api.get("/offers")).offers);
      else if (which === "shifts") setShifts((await api.get("/shifts")).shifts);
      else if (which === "restaurants") setRestaurants((await api.get("/restaurants")).restaurants);
      else if (which === "time") setTimeData(await api.get("/analytics/time"));
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(tab);
    }, [tab, load]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Insights</Text>

      {/* Chip row (sticky chrome) */}
      <View style={styles.chipRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {TABS.map((t) => {
            const on = tab === t;
            return (
              <View key={t} style={{ flexShrink: 0 }}>
                <Text
                  testID={`insights-tab-${t}`}
                  onPress={() => setTab(t)}
                  style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
                >
                  {TAB_LABEL[t]}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["2xl"] }}
        showsVerticalScrollIndicator={false}
      >
        {loading && <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.xl }} />}

        {!loading && tab === "offers" && (
          <>
            {offers.length === 0 && <Empty label="No offers recorded yet." />}
            {offers.map((o) => (
              <Card key={o.id} style={styles.offerCard}>
                <View style={[styles.verdictBar, { backgroundColor: verdictColor(o.verdict) }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.offerTop}>
                    <Text style={styles.offerPayout}>{money(o.payout)}</Text>
                    <Text style={[styles.offerScore, { color: verdictColor(o.verdict) }]}>{o.score}</Text>
                  </View>
                  <Text style={styles.offerMeta}>
                    {perMile(o.metrics?.effective_per_mile)} · {o.miles} mi · {o.minutes} min
                  </Text>
                  <Text style={styles.offerSub} numberOfLines={1}>
                    {o.restaurant || platformLabel(o.platform)} · {relTime(o.created_at)}
                  </Text>
                </View>
                <View style={styles.offerRight}>
                  <Pill
                    label={verdictLabel(o.verdict)}
                    color={verdictColor(o.verdict)}
                    bg={colors.surfaceTertiary}
                  />
                  {o.decision && (
                    <Text style={styles.decisionText}>
                      {o.decision === "accepted" ? "✓ Accepted" : "✕ Declined"}
                    </Text>
                  )}
                </View>
              </Card>
            ))}
          </>
        )}

        {!loading && tab === "shifts" && (
          <>
            {shifts.length === 0 && <Empty label="No shifts yet. Start one!" />}
            {shifts.map((s) => (
              <Card key={s.id} style={{ marginBottom: spacing.sm }}>
                <View style={styles.shiftTop}>
                  <Text style={styles.shiftDate}>{relTime(s.started_at)}</Text>
                  {!s.ended_at && <Pill label="● LIVE" color={colors.success} bg={colors.successTint} />}
                </View>
                <View style={styles.shiftGrid}>
                  <Metric label="Net" value={money(s.metrics?.net)} accent={colors.success} />
                  <Metric label="Online" value={duration(s.metrics?.online_seconds)} />
                  <Metric label="Net/hr" value={perHour(s.metrics?.per_hour_net)} />
                  <Metric label="Trips" value={`${s.metrics?.deliveries ?? 0}`} />
                </View>
              </Card>
            ))}
          </>
        )}

        {!loading && tab === "restaurants" && (
          <>
            {restaurants.length === 0 && <Empty label="No restaurant history yet." />}
            {restaurants.map((r) => (
              <Card key={r.restaurant} style={{ marginBottom: spacing.sm }}>
                <Text style={styles.rName}>{r.restaurant}</Text>
                <Text style={styles.rPickups}>{r.pickups} pickups</Text>
                <View style={styles.rGrid}>
                  <Metric label="Avg wait" value={`${r.avg_wait ?? "—"} min`} />
                  <Metric label="Median" value={`${r.median_wait ?? "—"} min`} />
                  <Metric label="Avg $/hr" value={perHour(r.avg_hourly)} />
                </View>
                {r.delay_penalty > 0 && (
                  <View style={styles.penaltyRow}>
                    <Text style={styles.penaltyText}>Typical delay penalty: -{r.delay_penalty} score</Text>
                  </View>
                )}
              </Card>
            ))}
          </>
        )}

        {!loading && tab === "time" && timeData && (
          <>
            {timeData.best_hour && (
              <View style={styles.timeCallouts}>
                <Card style={[styles.calloutCard, { borderColor: colors.success }]}>
                  <Text style={styles.calloutLabel}>BEST HOUR</Text>
                  <Text style={[styles.calloutValue, { color: colors.success }]}>
                    {fmtHour(timeData.best_hour.hour)}
                  </Text>
                  <Text style={styles.calloutSub}>{perHour(timeData.best_hour.value)}</Text>
                </Card>
                <Card style={[styles.calloutCard, { borderColor: colors.error }]}>
                  <Text style={styles.calloutLabel}>WEAKEST HOUR</Text>
                  <Text style={[styles.calloutValue, { color: colors.error }]}>
                    {fmtHour(timeData.worst_hour.hour)}
                  </Text>
                  <Text style={styles.calloutSub}>{perHour(timeData.worst_hour.value)}</Text>
                </Card>
              </View>
            )}

            <SectionTitle style={{ marginTop: spacing.lg }}>By Day of Week</SectionTitle>
            <Card>
              {(timeData.by_day || []).map((d: any) => (
                <BarRow key={d.label} label={d.label} value={d.value} max={maxVal(timeData.by_day)} />
              ))}
              {(timeData.by_day || []).length === 0 && <Empty label="Not enough data yet." />}
            </Card>

            <SectionTitle style={{ marginTop: spacing.lg }}>By Hour</SectionTitle>
            <Card>
              {(timeData.by_hour || []).map((h: any) => (
                <BarRow key={h.hour} label={fmtHour(h.hour)} value={h.value} max={maxVal(timeData.by_hour)} />
              ))}
              {(timeData.by_hour || []).length === 0 && <Empty label="Not enough data yet." />}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Empty({ label }: { label: string }) {
  return <Text style={styles.empty}>{label}</Text>;
}
function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}
function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${w}%` }]} />
      </View>
      <Text style={styles.barValue}>{perHour(value)}</Text>
    </View>
  );
}
function maxVal(arr: any[]) {
  return arr && arr.length ? Math.max(...arr.map((x) => x.value)) : 0;
}
function fmtHour(h: number) {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, letterSpacing: 0.5, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  chipRowWrap: { height: 56, justifyContent: "center" },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: {
    height: 36,
    lineHeight: 34,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.base,
    overflow: "hidden",
  },
  chipOn: { backgroundColor: colors.onSurface, color: colors.onSurfaceInverse, borderWidth: 1, borderColor: colors.onSurface },
  chipOff: { backgroundColor: colors.surfaceSecondary, color: colors.onSurfaceSecondary, borderWidth: 1, borderColor: colors.border },
  offerCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm, overflow: "hidden" },
  verdictBar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  offerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  offerPayout: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  offerScore: { fontFamily: fonts.display, fontSize: 26 },
  offerMeta: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, marginTop: 2 },
  offerSub: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  offerRight: { alignItems: "flex-end", gap: 4 },
  decisionText: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceSecondary },
  shiftTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  shiftDate: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, color: colors.onSurface },
  shiftGrid: { flexDirection: "row", flexWrap: "wrap" },
  metric: { width: "25%", marginBottom: spacing.xs },
  metricLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  metricValue: { fontFamily: fonts.displaySemi, fontSize: 22, color: colors.onSurface },
  rName: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, color: colors.onSurface },
  rPickups: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginBottom: spacing.md },
  rGrid: { flexDirection: "row" },
  penaltyRow: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  penaltyText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.error },
  timeCallouts: { flexDirection: "row", gap: spacing.md },
  calloutCard: { flex: 1, borderWidth: 1.5, alignItems: "flex-start" },
  calloutLabel: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.onSurfaceSecondary },
  calloutValue: { fontFamily: fonts.display, fontSize: 30, marginTop: 4 },
  calloutSub: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurface },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  barLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, width: 52 },
  barTrack: { flex: 1, height: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.brand, borderRadius: radius.pill },
  barValue: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, color: colors.onSurface, width: 64, textAlign: "right" },
  empty: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, textAlign: "center", paddingVertical: spacing.xl },
});

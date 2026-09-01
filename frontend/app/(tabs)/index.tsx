import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/context/AppContext";
import { Screen, Card, StatTile, SectionTitle, Pill } from "@/src/components/ui";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";
import { money, moneyWhole, duration, pct, perHour } from "@/src/utils/format";

function useLiveClock(startedAt?: string | null, active?: boolean) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (!active || !startedAt) {
      setSec(0);
      return;
    }
    const start = new Date(startedAt).getTime();
    const tick = () => setSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, active]);
  return sec;
}

export default function Home() {
  const router = useRouter();
  const { dashboard, refreshDashboard, startShift, endShift, loadingDash } = useApp();
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshDashboard();
    }, [refreshDashboard]),
  );

  const active = dashboard?.active_shift;
  const today = dashboard?.today;
  const best = dashboard?.best_zone;
  const liveSec = useLiveClock(active?.started_at, !!active);

  const onToggleShift = async () => {
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      if (active) await endShift();
      else await startShift();
    } finally {
      setBusy(false);
    }
  };

  const goalProgress = today?.goal_progress ?? 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["2xl"] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loadingDash} onRefresh={refreshDashboard} tintColor={colors.brand} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Ionicons name="speedometer" size={18} color={colors.onBrandPrimary} />
            </View>
            <Text style={styles.brand}>
              GIG<Text style={{ color: colors.brand }}>VERDICT</Text>
            </Text>
          </View>
          <Pill
            testID="shift-status-pill"
            label={active ? "● ON SHIFT" : "OFF SHIFT"}
            color={active ? colors.success : colors.onSurfaceSecondary}
            bg={active ? colors.successTint : colors.surfaceTertiary}
          />
        </View>

        {/* Start / End shift */}
        <Pressable
          testID="shift-toggle-button"
          onPress={onToggleShift}
          disabled={busy}
          style={({ pressed }) => [
            styles.shiftBtn,
            {
              backgroundColor: active ? colors.surfaceTertiary : colors.brand,
              borderColor: active ? colors.borderStrong : colors.brand,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={active ? colors.onSurface : colors.onBrandPrimary} />
          ) : (
            <>
              <Ionicons
                name={active ? "stop-circle" : "play-circle"}
                size={30}
                color={active ? colors.error : colors.onBrandPrimary}
              />
              <View>
                <Text style={[styles.shiftBtnText, { color: active ? colors.onSurface : colors.onBrandPrimary }]}>
                  {active ? "END SHIFT" : "START SHIFT"}
                </Text>
                {active ? (
                  <Text testID="shift-timer" style={styles.shiftTimer}>
                    {duration(liveSec)} online
                  </Text>
                ) : (
                  <Text style={[styles.shiftHint, { color: colors.onBrandPrimary }]}>Tap to go online</Text>
                )}
              </View>
            </>
          )}
        </Pressable>

        {/* Today metrics 2x2 */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Today</SectionTitle>
        <View style={styles.grid}>
          <StatTile testID="today-net" label="Net Earned" value={money(today?.net)} accent={colors.success} />
          <StatTile testID="today-per-hour" label="Net / Hour" value={perHour(today?.per_hour_net)} />
        </View>
        <View style={styles.grid}>
          <StatTile testID="today-per-mile" label="Net / Mile" value={`${money(today?.per_mile)}`} />
          <StatTile
            testID="today-deliveries"
            label="Deliveries"
            value={`${today?.deliveries ?? 0}`}
            sub={`${pct(today?.acceptance_rate)} accept rate`}
          />
        </View>

        {/* Goal */}
        <Pressable testID="goal-card" onPress={() => router.push("/goal")}>
          <Card style={{ marginTop: spacing.md }}>
            <View style={styles.goalHeader}>
              <View style={styles.goalTitleRow}>
                <SectionTitle style={{ marginBottom: 0 }}>Daily Goal</SectionTitle>
                <Ionicons name="pencil" size={13} color={colors.onSurfaceSecondary} />
              </View>
              <Text style={styles.goalValue}>
                {moneyWhole(today?.net)} <Text style={styles.goalTotal}>/ {moneyWhole(today?.goal)}</Text>
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(goalProgress * 100, 100)}%` }]} />
            </View>
            <View style={styles.goalFooter}>
              <Text style={styles.goalPct}>{pct(goalProgress)}</Text>
              {today?.est_hours_remaining ? (
                <Text style={styles.goalEta}>~{today.est_hours_remaining}h left at current pace</Text>
              ) : (
                <Text style={styles.goalEta}>Start earning to project</Text>
              )}
            </View>
          </Card>
        </Pressable>

        {/* Offer input */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Analyze an Offer</SectionTitle>
        <View style={styles.grid}>
          <Pressable
            testID="scan-offer-button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push("/scan");
            }}
            style={({ pressed }) => [styles.offerBtn, { opacity: pressed ? 0.9 : 1 }]}
          >
            <Ionicons name="scan" size={28} color={colors.brand} />
            <Text style={styles.offerBtnText}>SCAN OFFER</Text>
            <Text style={styles.offerBtnSub}>Screenshot</Text>
          </Pressable>
          <Pressable
            testID="enter-offer-button"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push("/enter");
            }}
            style={({ pressed }) => [styles.offerBtn, { opacity: pressed ? 0.9 : 1 }]}
          >
            <MaterialCommunityIcons name="numeric" size={28} color={colors.brand} />
            <Text style={styles.offerBtnText}>ENTER OFFER</Text>
            <Text style={styles.offerBtnSub}>Manual</Text>
          </Pressable>
        </View>

        <Pressable
          testID="auto-detect-button"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push("/live-capture");
          }}
          style={({ pressed }) => [styles.autoBtn, { opacity: pressed ? 0.9 : 1 }]}
        >
          <Ionicons name="flash" size={20} color={colors.info} />
          <Text style={styles.autoBtnText}>AUTO-DETECT (LIVE)</Text>
          <View style={styles.betaPill}>
            <Text style={styles.betaText}>BETA</Text>
          </View>
        </Pressable>

        {/* Best zone */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Best Current Move</SectionTitle>
        <Pressable testID="best-zone-card" onPress={() => router.push("/map")}>
          <Card>
            <View style={styles.zoneRow}>
              <View style={styles.zoneIcon}>
                <Ionicons
                  name={best?.suggestion === "move" ? "navigate" : "location"}
                  size={22}
                  color={colors.success}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.zoneName}>
                  {best?.suggestion === "move" ? best?.best?.name ?? "Reposition" : "Stay Here"}
                </Text>
                <Text style={styles.zoneMsg} numberOfLines={2}>
                  {best?.message ?? "Current area historically performs well."}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceSecondary} />
            </View>
          </Card>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 1, color: colors.onSurface },
  shiftBtn: {
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  shiftBtnText: { fontFamily: fonts.display, fontSize: 34, letterSpacing: 1 },
  shiftTimer: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  shiftHint: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, opacity: 0.8 },
  grid: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  goalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  goalValue: { fontFamily: fonts.display, fontSize: 26, color: colors.onSurface },
  goalTotal: { color: colors.onSurfaceSecondary, fontSize: 20 },
  progressTrack: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.brand, borderRadius: radius.pill },
  goalFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  goalPct: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.brand },
  goalEta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  offerBtn: {
    flex: 1,
    minHeight: 110,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  offerBtnText: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.5, color: colors.onSurface },
  offerBtnSub: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  goalTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  autoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.info,
  },
  autoBtnText: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, letterSpacing: 0.5, color: colors.info },
  betaPill: { backgroundColor: colors.info, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  betaText: { fontFamily: fonts.bodyBold, fontSize: 10, color: colors.onInfo, letterSpacing: 0.5 },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  zoneIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.successTint,
    alignItems: "center",
    justifyContent: "center",
  },
  zoneName: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, color: colors.onSurface },
  zoneMsg: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
});

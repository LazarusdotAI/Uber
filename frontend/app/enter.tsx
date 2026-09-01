import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useApp } from "@/src/context/AppContext";
import { PrimaryButton } from "@/src/components/ui";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";
import { platformLabel } from "@/src/utils/format";

const PLATFORMS = ["uber_eats", "doordash", "grubhub"];
const ZONES: { key: string | null; label: string }[] = [
  { key: null, label: "Unknown end" },
  { key: "hot", label: "Ends Hot" },
  { key: "neutral", label: "Ends Neutral" },
  { key: "dead", label: "Ends Dead" },
];

function Stepper({
  label,
  value,
  step,
  min,
  prefix,
  suffix,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  prefix?: string;
  suffix?: string;
  onChange: (v: number) => void;
  testID: string;
}) {
  const bump = (dir: number) => {
    Haptics.selectionAsync().catch(() => {});
    const next = Math.max(min, Math.round((value + dir * step) * 100) / 100);
    onChange(next);
  };
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable testID={`${testID}-minus`} onPress={() => bump(-1)} style={styles.stepBtn}>
          <Ionicons name="remove" size={30} color={colors.onSurface} />
        </Pressable>
        <View style={styles.stepValueWrap}>
          <Text testID={testID} style={styles.stepValue} numberOfLines={1} adjustsFontSizeToFit>
            {prefix}
            {value % 1 === 0 ? value : value.toFixed(2)}
            {suffix}
          </Text>
        </View>
        <Pressable testID={`${testID}-plus`} onPress={() => bump(1)} style={styles.stepBtn}>
          <Ionicons name="add" size={30} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

export default function EnterOffer() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setLastScored, refreshDashboard } = useApp();

  const [platform, setPlatform] = useState("uber_eats");
  const [payout, setPayout] = useState(7.5);
  const [milesV, setMilesV] = useState(4.0);
  const [minutes, setMinutes] = useState(20);
  const [deadhead, setDeadhead] = useState(0);
  const [endZone, setEndZone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        platform,
        payout,
        miles: milesV,
        minutes,
        deadhead_miles: deadhead,
        end_zone_type: endZone,
        capture_method: "manual",
      };
      const res = await api.post("/offers", body);
      setLastScored({ offer: res.offer, result: res.result, savedId: res.offer.id });
      await refreshDashboard();
      router.replace("/verdict");
    } catch {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Entry</Text>
        <Pressable testID="enter-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Platform */}
        <View style={styles.platformRow}>
          {PLATFORMS.map((p) => {
            const on = platform === p;
            return (
              <Pressable
                key={p}
                testID={`platform-${p}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setPlatform(p);
                }}
                style={[styles.platformChip, on && styles.platformChipOn]}
              >
                <Text style={[styles.platformText, on && { color: colors.onBrandPrimary }]}>
                  {platformLabel(p)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Stepper testID="stepper-payout" label="PAYOUT" value={payout} step={0.5} min={0} prefix="$" onChange={setPayout} />
        <Stepper testID="stepper-miles" label="MILES" value={milesV} step={0.5} min={0.5} suffix=" mi" onChange={setMilesV} />
        <Stepper testID="stepper-minutes" label="MINUTES" value={minutes} step={1} min={1} suffix=" min" onChange={setMinutes} />
        <Stepper
          testID="stepper-deadhead"
          label="DEADHEAD / REPOSITION MILES"
          value={deadhead}
          step={0.5}
          min={0}
          suffix=" mi"
          onChange={setDeadhead}
        />

        <Text style={styles.zoneTitle}>DROPOFF ZONE</Text>
        <View style={styles.zoneRow}>
          {ZONES.map((z) => {
            const on = endZone === z.key;
            return (
              <Pressable
                key={String(z.key)}
                testID={`endzone-${z.key ?? "none"}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setEndZone(z.key);
                }}
                style={[styles.zoneChip, on && styles.zoneChipOn]}
              >
                <Text style={[styles.zoneChipText, on && { color: colors.onSurface }]}>{z.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton testID="get-verdict-button" label="GET VERDICT" onPress={submit} loading={busy} big haptic="heavy" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, letterSpacing: 0.5 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  platformRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  platformChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  platformChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  platformText: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  stepper: { marginBottom: spacing.lg },
  stepperLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
  },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValueWrap: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { fontFamily: fonts.display, fontSize: 40, color: colors.onSurface },
  zoneTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  zoneRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  zoneChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneChipOn: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  zoneChipText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});

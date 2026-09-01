import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useApp } from "@/src/context/AppContext";
import { api } from "@/src/api/client";
import { colors, spacing, radius, fonts, fontSize, verdictColor, verdictTint, verdictLabel } from "@/src/theme/tokens";
import { money, miles, minutesLabel, perMile, perHour } from "@/src/utils/format";

const sentimentColor = (s: string) =>
  s === "positive" ? colors.success : s === "negative" ? colors.error : colors.onSurfaceSecondary;
const sentimentIcon = (s: string) =>
  s === "positive" ? "add-circle" : s === "negative" ? "remove-circle" : "ellipse";

export default function Verdict() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { lastScored, refreshDashboard } = useApp();
  const [decision, setDecision] = useState<string | null>(null);

  const result = lastScored?.result;
  const offer = lastScored?.offer;
  const v = result?.verdict ?? "maybe";
  const color = verdictColor(v);

  useEffect(() => {
    if (!result) return;
    const map: any = {
      take: Haptics.NotificationFeedbackType.Success,
      maybe: Haptics.NotificationFeedbackType.Warning,
      decline: Haptics.NotificationFeedbackType.Error,
    };
    Haptics.notificationAsync(map[v]).catch(() => {});
  }, [result, v]);

  const close = () => router.back();

  const recordDecision = async (d: "accepted" | "declined") => {
    setDecision(d);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (lastScored?.savedId) {
      try {
        await api.post(`/offers/${lastScored.savedId}/decision`, { decision: d });
        await refreshDashboard();
      } catch {}
    }
    setTimeout(close, 450);
  };

  if (!result || !offer) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.emptyText}>No active offer.</Text>
        <Pressable testID="verdict-dismiss-empty" onPress={close} style={styles.dismissBtn}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={[styles.tint, { backgroundColor: verdictTint(v), borderColor: color }]}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            paddingHorizontal: spacing.xl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Verdict header */}
          <View style={styles.verdictHead}>
            <Ionicons
              name={v === "take" ? "checkmark-circle" : v === "maybe" ? "help-circle" : "close-circle"}
              size={40}
              color={color}
            />
            <Text testID="verdict-label" style={[styles.verdictLabel, { color }]}>
              {verdictLabel(v)}
            </Text>
          </View>

          {/* Big money numbers */}
          <Text testID="verdict-payout" style={styles.payout}>
            {money(offer.payout)}
          </Text>
          <View style={styles.bigRow}>
            <Text style={styles.bigMetric}>{miles(offer.miles)}</Text>
            <Text style={styles.bigDot}>•</Text>
            <Text style={styles.bigMetric}>{minutesLabel(offer.minutes)}</Text>
          </View>

          {/* rate line */}
          <View style={styles.rateRow}>
            <View style={styles.rateItem}>
              <Text style={styles.rateValue}>{perMile(result.effective_per_mile)}</Text>
              <Text style={styles.rateLabel}>per mile</Text>
            </View>
            <View style={styles.rateItem}>
              <Text style={styles.rateValue}>{perHour(result.gross_hourly)}</Text>
              <Text style={styles.rateLabel}>gross / hr</Text>
            </View>
            <View style={styles.rateItem}>
              <Text style={[styles.rateValue, { color: colors.success }]}>{perHour(result.net_hourly)}</Text>
              <Text style={styles.rateLabel}>net / hr</Text>
            </View>
          </View>

          {/* Score */}
          <View style={[styles.scoreBox, { borderColor: color }]}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text testID="verdict-score" style={[styles.scoreValue, { color }]}>
              {result.score}
              <Text style={styles.scoreMax}>/100</Text>
            </Text>
          </View>

          {/* WHY */}
          <Text style={styles.whyTitle}>WHY</Text>
          <View style={styles.whyList} testID="verdict-reasons">
            {result.reasons.map((r, i) => (
              <View key={i} style={styles.whyRow}>
                <Ionicons name={sentimentIcon(r.sentiment) as any} size={18} color={sentimentColor(r.sentiment)} />
                <Text style={styles.whyText}>{r.text}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.netNote}>
            Est. net profit {money(result.net_profit)} · expenses {money(result.total_expense)}
          </Text>
        </ScrollView>

        {/* Decision actions */}
        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            testID="verdict-decline-button"
            onPress={() => recordDecision("declined")}
            style={[styles.actionBtn, styles.declineBtn, decision === "declined" && { opacity: 0.5 }]}
          >
            <Ionicons name="close" size={20} color={colors.error} />
            <Text style={[styles.actionText, { color: colors.error }]}>I Declined</Text>
          </Pressable>
          <Pressable
            testID="verdict-accept-button"
            onPress={() => recordDecision("accepted")}
            style={[styles.actionBtn, styles.acceptBtn, decision === "accepted" && { opacity: 0.5 }]}
          >
            <Ionicons name="checkmark" size={20} color={colors.onSuccess} />
            <Text style={[styles.actionText, { color: colors.onSuccess }]}>I Accepted</Text>
          </Pressable>
        </View>
        <Pressable testID="verdict-dismiss-button" onPress={close} style={styles.dismissRow}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tint: { flex: 1, borderWidth: 2, margin: 0 },
  verdictHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  verdictLabel: { fontFamily: fonts.display, fontSize: 52, letterSpacing: 1 },
  payout: { fontFamily: fonts.display, fontSize: 76, color: colors.onSurface, lineHeight: 78 },
  bigRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  bigMetric: { fontFamily: fonts.displaySemi, fontSize: 34, color: colors.onSurfaceTertiary },
  bigDot: { color: colors.onSurfaceSecondary, fontSize: 24 },
  rateRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xl },
  rateItem: { alignItems: "flex-start" },
  rateValue: { fontFamily: fonts.displaySemi, fontSize: 26, color: colors.onSurface },
  rateLabel: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  scoreBox: {
    marginTop: spacing.xl,
    borderWidth: 2,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scoreLabel: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, letterSpacing: 2, color: colors.onSurfaceSecondary },
  scoreValue: { fontFamily: fonts.display, fontSize: 48 },
  scoreMax: { fontFamily: fonts.displayMedium, fontSize: 24, color: colors.onSurfaceSecondary },
  whyTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.base,
    letterSpacing: 2,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  whyList: { gap: spacing.md },
  whyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  whyText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: colors.onSurface, flex: 1 },
  netNote: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    marginTop: spacing.xl,
  },
  actions: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  actionBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  declineBtn: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.error },
  acceptBtn: { backgroundColor: colors.success },
  actionText: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg },
  dismissRow: { alignItems: "center", paddingVertical: spacing.md },
  dismissText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
  dismissBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  emptyText: { fontFamily: fonts.body, fontSize: fontSize.lg, color: colors.onSurfaceSecondary },
});

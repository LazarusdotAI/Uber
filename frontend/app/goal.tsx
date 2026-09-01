import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useApp } from "@/src/context/AppContext";
import { PrimaryButton } from "@/src/components/ui";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";
import { moneyWhole } from "@/src/utils/format";

const QUICK = [200, 300, 500, 750, 1000];

export default function GoalModal() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refreshDashboard } = useApp();
  const [goal, setGoal] = useState<number>(500);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const g = await api.get<{ daily_goal: number }>("/goal");
        setGoal(g.daily_goal);
      } catch {}
    })();
  }, []);

  const bump = (dir: number) => {
    Haptics.selectionAsync().catch(() => {});
    setGoal((g) => Math.max(0, Math.round((g + dir * 25) / 25) * 25));
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/goal", { daily_goal: goal });
      await refreshDashboard();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily Goal</Text>
        <Pressable testID="goal-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.caption}>Set the net earnings you want to hit each day. Progress and pace update live.</Text>

        {/* Big stepper */}
        <View style={styles.stepperRow}>
          <Pressable testID="goal-minus" onPress={() => bump(-1)} style={styles.stepBtn}>
            <Ionicons name="remove" size={30} color={colors.onSurface} />
          </Pressable>
          <View style={styles.goalWrap}>
            <TextInput
              testID="goal-input"
              value={String(goal)}
              onChangeText={(t) => setGoal(Math.max(0, parseInt(t.replace(/[^0-9]/g, "") || "0", 10)))}
              keyboardType="number-pad"
              style={styles.goalValue}
            />
          </View>
          <Pressable testID="goal-plus" onPress={() => bump(1)} style={[styles.stepBtn, { backgroundColor: colors.brand }]}>
            <Ionicons name="add" size={30} color={colors.onBrandPrimary} />
          </Pressable>
        </View>

        {/* Quick picks */}
        <View style={styles.quickRow}>
          {QUICK.map((q) => {
            const on = goal === q;
            return (
              <Pressable
                key={q}
                testID={`goal-quick-${q}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setGoal(q);
                }}
                style={[styles.quickChip, on && styles.quickChipOn]}
              >
                <Text style={[styles.quickText, on && { color: colors.onBrandPrimary }]}>{moneyWhole(q)}</Text>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton testID="goal-save-button" label="SET GOAL" onPress={save} loading={busy} style={{ marginTop: spacing.xl }} />
      </KeyboardAwareScrollView>
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
  caption: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurfaceSecondary, marginBottom: spacing.xl, lineHeight: 20 },
  stepperRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: {
    width: 64,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  goalWrap: {
    flex: 1,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  goalValue: { fontFamily: fonts.display, fontSize: 48, color: colors.brand, textAlign: "center", minWidth: 120 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  quickChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  quickText: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onSurfaceSecondary },
});

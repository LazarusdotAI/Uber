import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useApp } from "@/src/context/AppContext";
import { Card, SectionTitle, PrimaryButton, GhostButton } from "@/src/components/ui";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";

const PRESETS = [
  { key: "aggressive", label: "AGGRESSIVE", desc: "Take more" },
  { key: "balanced", label: "BALANCED", desc: "Recommended" },
  { key: "selective", label: "SELECTIVE", desc: "Cherry-pick" },
];

const FIELDS: { key: string; label: string; prefix?: string; suffix?: string }[] = [
  { key: "min_payout", label: "Minimum payout", prefix: "$" },
  { key: "min_per_mile", label: "Minimum $/mile", prefix: "$" },
  { key: "pref_per_mile", label: "Preferred $/mile", prefix: "$" },
  { key: "min_hourly", label: "Minimum $/hour", prefix: "$" },
  { key: "pref_hourly", label: "Preferred $/hour", prefix: "$" },
];
const VEHICLE: { key: string; label: string; prefix?: string; suffix?: string }[] = [
  { key: "fuel_price", label: "Fuel price / gal", prefix: "$" },
  { key: "mpg", label: "Vehicle MPG", suffix: " mpg" },
  { key: "vehicle_cost_per_mile", label: "Operating cost / mile", prefix: "$" },
  { key: "max_deadhead", label: "Max deadhead", suffix: " mi" },
];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { refreshSettings } = useApp();
  const [settings, setSettings] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const s = await api.get("/settings");
      setSettings(s);
      setDirty(false);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSettings();
    }, [fetchSettings]),
  );

  const setField = (key: string, text: string) => {
    const num = text === "" ? "" : parseFloat(text);
    setSettings((s: any) => ({ ...s, [key]: isNaN(num as number) ? "" : num }));
    setDirty(true);
  };

  const applyPreset = async (name: string) => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const s = await api.post(`/settings/preset/${name}`);
      setSettings(s);
      setDirty(false);
      await refreshSettings();
    } catch {}
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {};
      [...FIELDS, ...VEHICLE, { key: "daily_goal" }].forEach((f) => {
        const v = settings[f.key];
        if (v !== "" && v != null) payload[f.key] = Number(v);
      });
      const s = await api.put("/settings", payload);
      setSettings(s);
      setDirty(false);
      await refreshSettings();
      setSavedMsg(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setTimeout(() => setSavedMsg(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Settings</Text>
      </View>
    );
  }

  const Row = ({ f }: { f: { key: string; label: string; prefix?: string; suffix?: string } }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{f.label}</Text>
      <View style={styles.inputWrap}>
        {f.prefix ? <Text style={styles.affix}>{f.prefix}</Text> : null}
        <TextInput
          testID={`setting-${f.key}`}
          value={String(settings[f.key] ?? "")}
          onChangeText={(t) => setField(f.key, t)}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={colors.onSurfaceSecondary}
        />
        {f.suffix ? <Text style={styles.affix}>{f.suffix}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Settings</Text>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        {/* Presets */}
        <SectionTitle>Strategy Preset</SectionTitle>
        <View style={styles.presetRow}>
          {PRESETS.map((p) => {
            const on = settings.preset === p.key;
            return (
              <Pressable
                key={p.key}
                testID={`preset-${p.key}`}
                onPress={() => applyPreset(p.key)}
                style={[styles.presetChip, on && styles.presetChipOn]}
              >
                <Text style={[styles.presetLabel, on && { color: colors.onBrandPrimary }]}>{p.label}</Text>
                <Text style={[styles.presetDesc, on && { color: colors.onBrandPrimary }]}>{p.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Thresholds */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Decision Thresholds</SectionTitle>
        <Card>
          {FIELDS.map((f, i) => (
            <View key={f.key}>
              <Row f={f} />
              {i < FIELDS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>

        {/* Vehicle */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Vehicle & Costs</SectionTitle>
        <Card>
          {VEHICLE.map((f, i) => (
            <View key={f.key}>
              <Row f={f} />
              {i < VEHICLE.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </Card>

        {/* Goal */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Daily Goal</SectionTitle>
        <Card>
          <Row f={{ key: "daily_goal", label: "Money target", prefix: "$" }} />
        </Card>

        {/* Profile */}
        <SectionTitle style={{ marginTop: spacing.xl }}>Account</SectionTitle>
        <Card>
          <Text style={styles.profileName}>{user?.name || "Driver"}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <GhostButton
            testID="sign-out-button"
            label="Sign Out"
            onPress={signOut}
            color={colors.error}
            style={{ marginTop: spacing.md, borderColor: colors.error }}
            icon={<Ionicons name="log-out-outline" size={18} color={colors.error} />}
          />
        </Card>

        <Text style={styles.safetyNote}>
          GigVerdict is advisory only. It never accepts, declines, or taps controls inside delivery apps.
        </Text>
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <PrimaryButton
          testID="save-settings-button"
          label={savedMsg ? "SAVED ✓" : dirty ? "SAVE CHANGES" : "SAVED"}
          onPress={save}
          loading={saving}
          disabled={!dirty && !savedMsg}
          color={savedMsg ? colors.success : colors.brand}
          textColor={savedMsg ? colors.onSuccess : colors.onBrandPrimary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, letterSpacing: 0.5, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  presetRow: { flexDirection: "row", gap: spacing.sm },
  presetChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  presetChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  presetLabel: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, color: colors.onSurface, letterSpacing: 0.5 },
  presetDesc: { fontFamily: fonts.body, fontSize: 11, color: colors.onSurfaceSecondary, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.sm },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurface, flex: 1 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minWidth: 110,
    height: 48,
  },
  affix: { fontFamily: fonts.bodyMedium, fontSize: fontSize.lg, color: colors.onSurfaceSecondary },
  input: {
    flex: 1,
    fontFamily: fonts.displaySemi,
    fontSize: 22,
    color: colors.onSurface,
    textAlign: "right",
    paddingVertical: 0,
    minWidth: 40,
  },
  divider: { height: 1, backgroundColor: colors.divider },
  profileName: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, color: colors.onSurface },
  profileEmail: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  safetyNote: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.xl, lineHeight: 18 },
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

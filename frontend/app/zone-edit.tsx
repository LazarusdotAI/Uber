import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { PrimaryButton, GhostButton } from "@/src/components/ui";
import { colors, spacing, radius, fonts, fontSize, zoneColor } from "@/src/theme/tokens";

const TYPES = [
  { key: "hot", label: "HOT", delta: 10 },
  { key: "neutral", label: "NEUTRAL", delta: 0 },
  { key: "dead", label: "DEAD", delta: -15 },
];

export default function ZoneEdit() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; lat?: string; lng?: string }>();
  const isEdit = !!params.id;

  const [name, setName] = useState("");
  const [type, setType] = useState("hot");
  const [radiusMiles, setRadiusMiles] = useState(1.0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      try {
        const res = await api.get<{ zones: any[] }>("/zones");
        const z = res.zones.find((x) => x.id === params.id);
        if (z) {
          setName(z.name);
          setType(z.type);
          setRadiusMiles(z.radius_miles);
        }
      } catch {}
    })();
  }, [params.id]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const body = {
      name: name.trim(),
      type,
      lat: parseFloat(params.lat || "30.0146"),
      lng: parseFloat(params.lng || "-95.5261"),
      radius_miles: radiusMiles,
      score_delta: null,
    };
    try {
      if (isEdit) await api.put(`/zones/${params.id}`, body);
      else await api.post("/zones", body);
      router.back();
    } catch {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!params.id) return;
    setBusy(true);
    try {
      await api.del(`/zones/${params.id}`);
      router.back();
    } catch {
      setBusy(false);
    }
  };

  const bumpRadius = (dir: number) => {
    Haptics.selectionAsync().catch(() => {});
    setRadiusMiles((r) => Math.max(0.2, Math.round((r + dir * 0.2) * 10) / 10));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{isEdit ? "Edit Zone" : "New Zone"}</Text>
        <Pressable testID="zone-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>ZONE NAME</Text>
        <TextInput
          testID="zone-name-input"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Vintage Park"
          placeholderTextColor={colors.onSurfaceSecondary}
          style={styles.input}
        />

        <Text style={[styles.label, { marginTop: spacing.lg }]}>ZONE TYPE</Text>
        <View style={styles.typeRow}>
          {TYPES.map((t) => {
            const on = type === t.key;
            const c = zoneColor(t.key);
            return (
              <Pressable
                key={t.key}
                testID={`zone-type-${t.key}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setType(t.key);
                }}
                style={[styles.typeChip, on && { borderColor: c, backgroundColor: `${c}22` }]}
              >
                <Text style={[styles.typeText, { color: on ? c : colors.onSurfaceSecondary }]}>{t.label}</Text>
                <Text style={[styles.typeDelta, { color: on ? c : colors.onSurfaceSecondary }]}>
                  {t.delta > 0 ? "+" : ""}
                  {t.delta}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { marginTop: spacing.lg }]}>RADIUS</Text>
        <View style={styles.radiusRow}>
          <Pressable testID="radius-minus" onPress={() => bumpRadius(-1)} style={styles.radiusBtn}>
            <Ionicons name="remove" size={26} color={colors.onSurface} />
          </Pressable>
          <View style={styles.radiusVal}>
            <Text testID="radius-value" style={styles.radiusText}>
              {radiusMiles.toFixed(1)} mi
            </Text>
          </View>
          <Pressable testID="radius-plus" onPress={() => bumpRadius(1)} style={styles.radiusBtn}>
            <Ionicons name="add" size={26} color={colors.onBrandPrimary} />
          </Pressable>
        </View>

        <Text style={styles.coordNote}>
          Location: {parseFloat(params.lat || "30.0146").toFixed(4)}, {parseFloat(params.lng || "-95.5261").toFixed(4)}
        </Text>

        <PrimaryButton testID="save-zone-button" label={isEdit ? "SAVE CHANGES" : "CREATE ZONE"} onPress={save} loading={busy} style={{ marginTop: spacing.xl }} />

        {isEdit && (
          <GhostButton testID="delete-zone-button" label="Delete Zone" onPress={remove} color={colors.error} style={{ marginTop: spacing.md, borderColor: colors.error }} icon={<Ionicons name="trash" size={18} color={colors.error} />} />
        )}
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
  label: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, letterSpacing: 1.5, color: colors.onSurfaceSecondary, marginBottom: spacing.sm },
  input: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },
  typeRow: { flexDirection: "row", gap: spacing.sm },
  typeChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  typeText: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, letterSpacing: 0.5 },
  typeDelta: { fontFamily: fonts.display, fontSize: 22, marginTop: 2 },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  radiusBtn: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  radiusVal: {
    flex: 1,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radiusText: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface },
  coordNote: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: spacing.md },
});

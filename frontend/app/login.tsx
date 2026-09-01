import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/src/context/AuthContext";
import { PrimaryButton } from "@/src/components/ui";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";

function VerdictChip({ color, label, icon }: { color: string; label: string; icon: any }) {
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { signIn, signingIn } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.hero}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Ionicons name="speedometer" size={30} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.brand}>
            GIG<Text style={{ color: colors.brand }}>VERDICT</Text>
          </Text>
        </View>
        <Text style={styles.tagline}>Know before you go.</Text>
        <Text style={styles.sub}>
          Instant TAKE / MAYBE / DECLINE calls on every delivery offer — tuned to your own numbers.
        </Text>

        <View style={styles.chips}>
          <VerdictChip color={colors.success} label="TAKE IT" icon="checkmark-circle" />
          <VerdictChip color={colors.warning} label="MAYBE" icon="help-circle" />
          <VerdictChip color={colors.error} label="DECLINE" icon="close-circle" />
        </View>
      </View>

      <View style={styles.footer}>
        <PrimaryButton
          testID="google-signin-button"
          label={signingIn ? "Signing in..." : "Continue with Google"}
          loading={signingIn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            signIn();
          }}
          icon={<Ionicons name="logo-google" size={20} color={colors.onBrandPrimary} />}
          color={colors.onSurface}
          textColor={colors.onSurfaceInverse}
        />
        <Text style={styles.safety}>
          Advisory tool only. GigVerdict never taps, accepts, or declines inside delivery apps — you always decide.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    justifyContent: "space-between",
  },
  hero: { flex: 1, justifyContent: "center" },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontFamily: fonts.display, fontSize: 38, letterSpacing: 1.5, color: colors.onSurface },
  tagline: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, marginBottom: spacing.sm },
  sub: {
    fontFamily: fonts.body,
    fontSize: fontSize.lg,
    color: colors.onSurfaceSecondary,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  chips: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, letterSpacing: 0.5 },
  footer: { gap: spacing.lg },
  safety: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
});

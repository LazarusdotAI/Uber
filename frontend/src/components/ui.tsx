// Shared UI primitives for GigVerdict (dark automotive/trading dashboard).
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  StyleProp,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";

export function Screen({
  children,
  style,
  padTop = true,
  padBottom = false,
  background = colors.surface,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padTop?: boolean;
  padBottom?: boolean;
  background?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: background,
          paddingTop: padTop ? insets.top : 0,
          paddingBottom: padBottom ? insets.bottom : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
  tone = "secondary",
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "secondary" | "tertiary";
}) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tone === "tertiary" ? colors.surfaceTertiary : colors.surfaceSecondary },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

export function StatTile({
  label,
  value,
  sub,
  accent,
  testID,
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={[styles.statTile, style]} tone="secondary">
      <Text style={styles.statLabel} testID={testID ? `${testID}-label` : undefined}>
        {label}
      </Text>
      <Text
        style={[styles.statValue, accent ? { color: accent } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        testID={testID}
      >
        {value}
      </Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </Card>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  color = colors.brandPrimary,
  textColor = colors.onBrandPrimary,
  icon,
  testID,
  style,
  big = false,
  haptic = "medium",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
  textColor?: string;
  icon?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
  haptic?: "light" | "medium" | "heavy" | "none";
}) {
  const handle = () => {
    if (disabled || loading) return;
    if (haptic !== "none") {
      const map = {
        light: Haptics.ImpactFeedbackStyle.Light,
        medium: Haptics.ImpactFeedbackStyle.Medium,
        heavy: Haptics.ImpactFeedbackStyle.Heavy,
      } as const;
      Haptics.impactAsync(map[haptic]).catch(() => {});
    }
    onPress();
  };
  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryBtn,
        big && styles.primaryBtnBig,
        { backgroundColor: color, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.btnRow}>
          {icon}
          <Text style={[styles.primaryBtnText, big && styles.primaryBtnTextBig, { color: textColor }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  icon,
  testID,
  style,
  color = colors.onSurface,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.ghostBtn, { opacity: pressed ? 0.7 : 1 }, style]}
    >
      <View style={styles.btnRow}>
        {icon}
        <Text style={[styles.ghostBtnText, { color }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function Pill({
  label,
  color = colors.onSurfaceSecondary,
  bg = colors.surfaceTertiary,
  testID,
  style,
}: {
  label: string;
  color?: string;
  bg?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]} testID={testID}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    letterSpacing: 1.5,
    color: colors.onSurfaceSecondary,
    textTransform: "uppercase",
    marginBottom: spacing.md,
  },
  statTile: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
  },
  statLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.sm,
    letterSpacing: 1,
    color: colors.onSurfaceSecondary,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 40,
    color: colors.onSurface,
    lineHeight: 44,
  },
  statSub: {
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
    marginTop: 2,
  },
  primaryBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  primaryBtnBig: {
    minHeight: 96,
    borderRadius: radius.lg,
  },
  primaryBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.lg,
    letterSpacing: 0.5,
  },
  primaryBtnTextBig: {
    fontFamily: fonts.display,
    fontSize: 34,
    letterSpacing: 1,
  },
  btnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  ghostBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  ghostBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.base,
    letterSpacing: 0.5,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  pillText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSize.sm,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
});

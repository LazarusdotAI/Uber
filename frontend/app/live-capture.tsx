import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useApp } from "@/src/context/AppContext";
import { Card, PrimaryButton, Pill } from "@/src/components/ui";
import {
  getCaptureProvider,
  simulateDetection,
  RawOffer,
  CaptureStatus,
} from "@/src/capture/OfferCaptureProvider";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";

const SAMPLES: RawOffer[] = [
  { platform: "uber_eats", payout: 12.5, miles: 4.2, minutes: 19, restaurant: "Chipotle – Vintage Park", capture_method: "live" },
  { platform: "doordash", payout: 4.25, miles: 7.8, minutes: 26, restaurant: "McDonald's – Spring", capture_method: "live" },
  { platform: "uber_eats", payout: 9.0, miles: 3.1, minutes: 16, restaurant: "Wingstop – Louetta", capture_method: "live" },
  { platform: "grubhub", payout: 15.75, miles: 5.4, minutes: 24, restaurant: "Whataburger – 249", capture_method: "live" },
];

const IS_IOS = Platform.OS === "ios";
const IS_WEB = Platform.OS === "web";

export default function LiveCapture() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setLastScored, refreshDashboard } = useApp();
  const provider = getCaptureProvider();
  const [status, setStatus] = useState<CaptureStatus>(provider.captureStatus());
  const [scoring, setScoring] = useState(false);
  const scoringRef = useRef(false);

  useEffect(() => {
    const offStatus = provider.onStatusChange(setStatus);
    const offDetect = provider.onOfferDetected(async (raw) => {
      if (scoringRef.current) return;
      scoringRef.current = true;
      setScoring(true);
      try {
        const body = {
          platform: raw.platform || "uber_eats",
          payout: raw.payout || 0,
          miles: raw.miles || 0.5,
          minutes: raw.minutes || 1,
          restaurant: raw.restaurant || null,
          capture_method: "live",
        };
        const res = await api.post("/offers", body);
        setLastScored({ offer: res.offer, result: res.result, savedId: res.offer.id });
        await refreshDashboard();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.push("/verdict");
      } catch {
        /* silent */
      } finally {
        setScoring(false);
        scoringRef.current = false;
      }
    });
    return () => {
      offStatus();
      offDetect();
    };
  }, [provider, router, setLastScored, refreshDashboard]);

  const toggleCapture = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (status === "listening" || status === "starting") await provider.stopCapture();
    else await provider.startCapture();
  };

  const runDemo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
    simulateDetection(sample);
  };

  const available = provider.available;
  const listening = status === "listening";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Auto-Detect</Text>
        <Pressable testID="live-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, flex: 1 }}>
        {/* Radar / status hero */}
        <View style={styles.hero}>
          <View style={[styles.radar, listening && { borderColor: colors.info }]}>
            {scoring ? (
              <ActivityIndicator color={colors.info} size="large" />
            ) : (
              <Ionicons name="flash" size={48} color={listening ? colors.info : colors.onSurfaceSecondary} />
            )}
          </View>
          <Pill
            testID="capture-status-pill"
            label={`STATUS: ${status.toUpperCase()}`}
            color={listening ? colors.info : colors.onSurfaceSecondary}
            bg={colors.surfaceTertiary}
            style={{ marginTop: spacing.lg }}
          />
        </View>

        {/* Availability banner */}
        {!available && (
          <Card style={{ borderColor: colors.warning, marginBottom: spacing.md }}>
            <View style={styles.bannerHead}>
              <Ionicons name="information-circle" size={18} color={colors.warning} />
              <Text style={styles.bannerTitle}>Requires a native build</Text>
            </View>
            <Text style={styles.bannerText}>
              {IS_IOS
                ? "iOS does not allow reading another app's screen. On a native build, use the Share Extension: screenshot the Uber offer → Share → GigVerdict."
                : IS_WEB
                ? "Live capture is a device-only feature and cannot run in the web preview."
                : "On Android, live capture uses an Accessibility Service that reads the Uber Driver offer overlay. Enable it in a native build, then GigVerdict scores every offer automatically."}
            </Text>
          </Card>
        )}

        {/* How it works */}
        <Card style={{ marginBottom: spacing.md }}>
          <Text style={styles.howTitle}>How auto-detect works</Text>
          <Step n="1" text={IS_IOS ? "Screenshot the offer and Share it to GigVerdict (native build)." : "GigVerdict's capture service reads the incoming offer overlay."} />
          <Step n="2" text="Payout, miles and time are parsed and sent to the scoring engine." />
          <Step n="3" text="The TAKE / MAYBE / DECLINE verdict pops instantly — you decide." />
          <Text style={styles.safety}>
            GigVerdict never taps, accepts or declines inside Uber. It only reads offer text to advise you.
          </Text>
        </Card>

        {/* Controls */}
        <PrimaryButton
          testID="capture-toggle-button"
          label={listening ? "STOP LISTENING" : "START LISTENING"}
          onPress={toggleCapture}
          disabled={!available}
          color={listening ? colors.surfaceTertiary : colors.info}
          textColor={listening ? colors.onSurface : colors.onInfo}
          icon={<Ionicons name={listening ? "stop" : "radio"} size={20} color={listening ? colors.onSurface : colors.onInfo} />}
        />

        <Pressable testID="demo-detection-button" onPress={runDemo} style={styles.demoBtn} disabled={scoring}>
          <Ionicons name="play-circle" size={20} color={colors.brand} />
          <Text style={styles.demoText}>Run demo detection</Text>
        </Pressable>
        <Text style={styles.demoNote}>
          Demo simulates one incoming offer through the exact live pipeline so you can preview the auto-scoring experience.
        </Text>
      </View>
    </View>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
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
  hero: { alignItems: "center", paddingVertical: spacing.xl },
  radar: {
    width: 130,
    height: 130,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  bannerTitle: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onSurface },
  bannerText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, lineHeight: 19 },
  howTitle: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onSurface, marginBottom: spacing.md },
  step: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  stepNum: { width: 26, height: 26, borderRadius: 999, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, color: colors.onBrandTertiary },
  stepText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceTertiary, flex: 1, lineHeight: 19 },
  safety: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontStyle: "italic" },
  demoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg, paddingVertical: spacing.md },
  demoText: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.brand },
  demoNote: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.xs, lineHeight: 17 },
});

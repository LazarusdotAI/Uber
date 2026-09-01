import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useApp } from "@/src/context/AppContext";
import { PrimaryButton, Card } from "@/src/components/ui";
import { getCaptureProvider } from "@/src/capture/OfferCaptureProvider";
import { colors, spacing, radius, fonts, fontSize } from "@/src/theme/tokens";
import { platformLabel } from "@/src/utils/format";

type Fields = { payout: string; miles: string; minutes: string; restaurant: string; platform: string };

function Field({
  label,
  value,
  onChange,
  keyboardType = "decimal-pad",
  testID,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  keyboardType?: any;
  testID: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholder="—"
        placeholderTextColor={colors.onSurfaceSecondary}
        style={styles.input}
      />
    </View>
  );
}

export default function Scan() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ sharedUri?: string }>();
  const { setLastScored, refreshDashboard } = useApp();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permBlocked, setPermBlocked] = useState(false);
  const [fields, setFields] = useState<Fields | null>(null);
  const [busy, setBusy] = useState(false);
  const captureStatus = getCaptureProvider().captureStatus();

  const pickImage = async () => {
    setError(null);
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      if (perm.canAskAgain) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        status = req.status;
        if (status !== "granted") {
          setPermBlocked(!req.canAskAgain);
          return;
        }
      } else {
        setPermBlocked(true);
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    await runScan(asset.base64 || "", asset.mimeType || "image/jpeg");
  };

  const runScan = async (base64: string, mime: string) => {
    if (!base64) {
      setError("Could not read image data.");
      return;
    }
    setScanning(true);
    setError(null);
    try {
      const res = await api.post("/offers/scan", { image_base64: base64, mime_type: mime });
      const e = res.extracted || {};
      setFields({
        payout: e.payout != null ? String(e.payout) : "",
        miles: e.miles != null ? String(e.miles) : "",
        minutes: e.minutes != null ? String(e.minutes) : "",
        restaurant: e.restaurant || "",
        platform: e.platform || "uber_eats",
      });
    } catch (err: any) {
      setError(err?.message || "Could not read screenshot. Enter values manually below.");
      setFields({ payout: "", miles: "", minutes: "", restaurant: "", platform: "uber_eats" });
    } finally {
      setScanning(false);
    }
  };

  // Auto-handle a shared offer screenshot (iOS Share Extension / Android share):
  // read the file to base64 and run OCR immediately, then user taps GET VERDICT.
  useEffect(() => {
    if (!params.sharedUri) return;
    let cancelled = false;
    (async () => {
      try {
        const uri = params.sharedUri as string;
        setImageUri(uri);
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
        if (!cancelled) {
          await runScan(b64, uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
        }
      } catch {
        if (!cancelled) {
          setError("Could not read the shared image. Choose one manually below.");
          setFields({ payout: "", miles: "", minutes: "", restaurant: "", platform: "uber_eats" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.sharedUri]);

  const submit = async () => {
    if (!fields) return;
    setBusy(true);
    try {
      const body = {
        platform: fields.platform,
        payout: parseFloat(fields.payout) || 0,
        miles: parseFloat(fields.miles) || 0.5,
        minutes: parseFloat(fields.minutes) || 1,
        restaurant: fields.restaurant || null,
        capture_method: "scan",
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
        <Text style={styles.title}>Scan Offer</Text>
        <Pressable testID="scan-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.onSurface} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
        bottomOffset={20}
        showsVerticalScrollIndicator={false}
      >
        {/* Picker / preview */}
        <Pressable testID="pick-screenshot-button" onPress={pickImage} style={styles.dropzone}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} contentFit="cover" />
          ) : (
            <>
              <Ionicons name="image" size={40} color={colors.brand} />
              <Text style={styles.dropTitle}>Choose an offer screenshot</Text>
              <Text style={styles.dropSub}>Uber Eats · DoorDash · Grubhub</Text>
            </>
          )}
          {scanning && (
            <View style={styles.scanOverlay}>
              <ActivityIndicator color={colors.brand} size="large" />
              <Text style={styles.scanText}>Reading offer…</Text>
            </View>
          )}
        </Pressable>

        {permBlocked && (
          <Card style={{ marginTop: spacing.md, borderColor: colors.warning }}>
            <Text style={styles.permText}>Photo access is off. Enable it in Settings to scan screenshots.</Text>
            <Pressable testID="open-settings-button" onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
              <Text style={styles.settingsBtnText}>Open Settings</Text>
            </Pressable>
          </Card>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning" size={18} color={colors.warning} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Editable extracted values */}
        {fields && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={styles.reviewTitle}>Review & correct — {platformLabel(fields.platform)}</Text>
            <Field testID="scan-field-payout" label="PAYOUT ($)" value={fields.payout} onChange={(t) => setFields({ ...fields, payout: t })} />
            <Field testID="scan-field-miles" label="MILES" value={fields.miles} onChange={(t) => setFields({ ...fields, miles: t })} />
            <Field testID="scan-field-minutes" label="MINUTES" value={fields.minutes} onChange={(t) => setFields({ ...fields, minutes: t })} />
            <Field
              testID="scan-field-restaurant"
              label="RESTAURANT"
              value={fields.restaurant}
              onChange={(t) => setFields({ ...fields, restaurant: t })}
              keyboardType="default"
            />
          </View>
        )}

        {/* Live capture placeholder */}
        <Card style={{ marginTop: spacing.xl, borderColor: colors.border }} tone="secondary">
          <View style={styles.liveHead}>
            <Ionicons name="flash" size={18} color={colors.info} />
            <Text style={styles.liveTitle}>Auto-Detect (coming to native builds)</Text>
          </View>
          <Text style={styles.liveText}>
            Live on-screen offer detection needs a native OS capture module and cannot run in Expo Go or on the web.
            The scoring engine is already wired to accept live offers the moment that module ships.
          </Text>
          <View style={styles.liveStatusRow}>
            <Text style={styles.liveStatusLabel}>captureStatus</Text>
            <Text style={styles.liveStatusValue}>{captureStatus}</Text>
          </View>
          <Pressable testID="open-live-capture" onPress={() => router.push("/live-capture")} style={styles.liveOpenBtn}>
            <Ionicons name="flash" size={16} color={colors.info} />
            <Text style={styles.liveOpenText}>Open Auto-Detect</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.info} />
          </Pressable>
        </Card>
      </KeyboardAwareScrollView>

      {fields && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton testID="scan-get-verdict-button" label="GET VERDICT" onPress={submit} loading={busy} big haptic="heavy" />
        </View>
      )}
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
  dropzone: {
    minHeight: 220,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    gap: spacing.sm,
  },
  preview: { ...StyleSheet.absoluteFillObject },
  dropTitle: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, color: colors.onSurface },
  dropSub: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  scanOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(13,14,18,0.8)", alignItems: "center", justifyContent: "center", gap: spacing.md },
  scanText: { fontFamily: fonts.bodyMedium, fontSize: fontSize.base, color: colors.onSurface },
  permText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface, marginBottom: spacing.md },
  settingsBtn: { alignSelf: "flex-start", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.brand },
  settingsBtnText: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onBrandPrimary },
  errorBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningTint },
  errorText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurface, flex: 1 },
  reviewTitle: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onSurface, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, letterSpacing: 1, color: colors.onSurfaceSecondary, marginBottom: spacing.xs },
  input: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.displaySemi,
    fontSize: 26,
    color: colors.onSurface,
  },
  liveHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  liveTitle: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onSurface },
  liveText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, lineHeight: 19 },
  liveStatusRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  liveStatusLabel: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  liveStatusValue: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, color: colors.info },
  liveOpenBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.info,
  },
  liveOpenText: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.info },
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

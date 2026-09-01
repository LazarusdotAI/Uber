import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import ZoneMap, { Zone } from "@/src/components/ZoneMap";
import { api } from "@/src/api/client";
import { Card, SectionTitle, Pill } from "@/src/components/ui";
import { colors, spacing, radius, fonts, fontSize, zoneColor } from "@/src/theme/tokens";
import { perHour } from "@/src/utils/format";

const DEFAULT_REGION = {
  latitude: 30.0146,
  longitude: -95.5261,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [zones, setZones] = useState<Zone[]>([]);
  const [best, setBest] = useState<any>(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locBlocked, setLocBlocked] = useState(false);

  const load = useCallback(async (lat?: number, lng?: number) => {
    try {
      const z = await api.get<{ zones: Zone[] }>("/zones");
      setZones(z.zones);
      const q = lat != null && lng != null ? `?lat=${lat}&lng=${lng}` : "";
      const b = await api.get(`/zones/best${q}`);
      setBest(b);
    } catch {}
  }, []);

  const requestLocation = useCallback(async () => {
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      let status = perm.status;
      if (status !== "granted") {
        if (perm.canAskAgain) {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
          if (status !== "granted") {
            setLocBlocked(!req.canAskAgain);
            return null;
          }
        } else {
          setLocBlocked(true);
          return null;
        }
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(c);
      setRegion({ latitude: c.lat, longitude: c.lng, latitudeDelta: 0.15, longitudeDelta: 0.15 });
      return c;
    } catch {
      return null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const c = await requestLocation();
        await load(c?.lat, c?.lng);
      })();
    }, [requestLocation, load]),
  );

  const addZone = (lat?: number, lng?: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const la = lat ?? coords?.lat ?? region.latitude;
    const ln = lng ?? coords?.lng ?? region.longitude;
    router.push({ pathname: "/zone-edit", params: { lat: String(la), lng: String(ln) } } as any);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Zones</Text>
        <Pressable testID="add-zone-button" onPress={() => addZone()} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
          <Text style={styles.addBtnText}>Add Zone</Text>
        </Pressable>
      </View>

      <View style={styles.mapWrap}>
        <ZoneMap
          zones={zones}
          region={region}
          style={StyleSheet.absoluteFill}
          onLongPress={(c) => addZone(c.latitude, c.longitude)}
        />
        {Platform.OS !== "web" && (
          <View style={styles.mapHint}>
            <Text style={styles.mapHintText}>Long-press map to drop a zone</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.panel}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Best move */}
        <SectionTitle>Smart Repositioning</SectionTitle>
        <Card style={{ marginBottom: spacing.lg }}>
          <View style={styles.bestRow}>
            <View style={[styles.bestIcon, { backgroundColor: colors.successTint }]}>
              <Ionicons name={best?.suggestion === "move" ? "navigate" : "location"} size={22} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bestName}>
                {best?.suggestion === "move" ? best?.best?.name ?? "Reposition" : "Stay Here"}
              </Text>
              <Text style={styles.bestMsg}>{best?.message ?? "Current area historically performs well."}</Text>
              {best?.best?.historical_hourly ? (
                <Text style={styles.bestStat}>
                  ~{best.best.eta_minutes} min · historically {perHour(best.best.historical_hourly)}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>

        {locBlocked && (
          <Card style={{ marginBottom: spacing.lg, borderColor: colors.warning }}>
            <Text style={styles.permText}>Enable location to center the map and rank nearby zones.</Text>
            <Pressable testID="open-location-settings" onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
              <Text style={styles.settingsBtnText}>Open Settings</Text>
            </Pressable>
          </Card>
        )}

        {/* Zone list */}
        <SectionTitle>Your Zones ({zones.length})</SectionTitle>
        {zones.map((z) => (
          <Pressable
            key={z.id}
            testID={`zone-item-${z.id}`}
            onPress={() =>
              router.push({
                pathname: "/zone-edit",
                params: { id: z.id, lat: String(z.lat), lng: String(z.lng) },
              } as any)
            }
          >
            <Card style={styles.zoneCard}>
              <View style={[styles.zoneDot, { backgroundColor: zoneColor(z.type) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.zoneName}>{z.name}</Text>
                <Text style={styles.zoneMeta}>
                  {z.radius_miles} mi radius · {z.score_delta > 0 ? "+" : ""}
                  {z.score_delta} score
                </Text>
              </View>
              <Pill
                label={z.type.toUpperCase()}
                color={zoneColor(z.type)}
                bg={colors.surfaceTertiary}
              />
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, letterSpacing: 0.5 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  addBtnText: { fontFamily: fonts.bodyBold, fontSize: fontSize.sm, color: colors.onBrandPrimary },
  mapWrap: { height: 260, marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  mapHint: {
    position: "absolute",
    bottom: spacing.sm,
    alignSelf: "center",
    backgroundColor: "rgba(13,14,18,0.75)",
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  mapHintText: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary },
  panel: { flex: 1, marginTop: spacing.md },
  bestRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  bestIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  bestName: { fontFamily: fonts.bodyBold, fontSize: fontSize.lg, color: colors.onSurface },
  bestMsg: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
  bestStat: { fontFamily: fonts.bodyMedium, fontSize: fontSize.sm, color: colors.success, marginTop: 4 },
  permText: { fontFamily: fonts.body, fontSize: fontSize.base, color: colors.onSurface, marginBottom: spacing.md },
  settingsBtn: { alignSelf: "flex-start", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.brand },
  settingsBtnText: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onBrandPrimary },
  zoneCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  zoneDot: { width: 12, height: 12, borderRadius: 999 },
  zoneName: { fontFamily: fonts.bodyBold, fontSize: fontSize.base, color: colors.onSurface },
  zoneMeta: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.onSurfaceSecondary, marginTop: 2 },
});

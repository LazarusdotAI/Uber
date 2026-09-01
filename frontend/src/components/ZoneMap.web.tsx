// Web fallback for ZoneMap — react-native-maps has no web support.
// Shows a styled schematic with the zones plotted relative to each other.
import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { colors, spacing, radius, fonts, fontSize, zoneColor } from "@/src/theme/tokens";

export type Zone = {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  radius_miles: number;
  score_delta: number;
};

export default function ZoneMap({
  zones,
  style,
}: {
  zones: Zone[];
  region?: any;
  onLongPress?: any;
  style?: StyleProp<ViewStyle>;
  showUser?: boolean;
}) {
  const lats = zones.map((z) => z.lat);
  const lngs = zones.map((z) => z.lng);
  const minLat = Math.min(...lats, 0);
  const maxLat = Math.max(...lats, 1);
  const minLng = Math.min(...lngs, 0);
  const maxLng = Math.max(...lngs, 1);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;

  return (
    <View style={[styles.wrap, style]} testID="zone-map">
      <View style={styles.grid}>
        {zones.map((z) => {
          const top = ((maxLat - z.lat) / spanLat) * 78 + 8;
          const left = ((z.lng - minLng) / spanLng) * 78 + 8;
          const c = zoneColor(z.type);
          return (
            <View
              key={z.id}
              style={[styles.dot, { top: `${top}%`, left: `${left}%`, borderColor: c, backgroundColor: `${c}33` }]}
            >
              <View style={[styles.dotCore, { backgroundColor: c }]} />
              <Text style={styles.dotLabel} numberOfLines={1}>
                {z.name}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.note}>Interactive map available on device</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#14161c",
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  grid: { flex: 1, position: "relative" },
  dot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dotCore: { width: 6, height: 6, borderRadius: 999 },
  dotLabel: {
    position: "absolute",
    top: 16,
    width: 120,
    textAlign: "center",
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: colors.onSurfaceSecondary,
  },
  note: {
    position: "absolute",
    bottom: spacing.sm,
    alignSelf: "center",
    fontFamily: fonts.body,
    fontSize: fontSize.sm,
    color: colors.onSurfaceSecondary,
  },
});

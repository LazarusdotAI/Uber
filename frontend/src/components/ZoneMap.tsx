// Native zone map (iOS Apple Maps / Android Google Maps) with dark styling.
import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import MapView, { Circle, Marker, PROVIDER_DEFAULT, Region } from "react-native-maps";
import { zoneColor } from "@/src/theme/tokens";

export type Zone = {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  radius_miles: number;
  score_delta: number;
};

const MILE_TO_M = 1609.34;

const darkStyle = [
  { elementType: "geometry", stylers: [{ color: "#0d0e12" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d0e12" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8892a0" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#262a33" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9aa3b0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1520" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#14161c" }] },
];

export default function ZoneMap({
  zones,
  region,
  onLongPress,
  style,
  showUser = true,
}: {
  zones: Zone[];
  region: Region;
  onLongPress?: (coord: { latitude: number; longitude: number }) => void;
  style?: StyleProp<ViewStyle>;
  showUser?: boolean;
}) {
  return (
    <MapView
      testID="zone-map"
      provider={PROVIDER_DEFAULT}
      style={style}
      initialRegion={region}
      customMapStyle={darkStyle}
      showsUserLocation={showUser}
      showsMyLocationButton={false}
      showsCompass={false}
      onLongPress={(e) => onLongPress?.(e.nativeEvent.coordinate)}
    >
      {zones.map((z) => {
        const c = zoneColor(z.type);
        return (
          <React.Fragment key={z.id}>
            <Circle
              center={{ latitude: z.lat, longitude: z.lng }}
              radius={z.radius_miles * MILE_TO_M}
              strokeColor={c}
              strokeWidth={2}
              fillColor={`${c}22`}
            />
            <Marker
              coordinate={{ latitude: z.lat, longitude: z.lng }}
              title={z.name}
              description={`${z.type.toUpperCase()} • ${z.score_delta > 0 ? "+" : ""}${z.score_delta}`}
              pinColor={c}
            />
          </React.Fragment>
        );
      })}
    </MapView>
  );
}

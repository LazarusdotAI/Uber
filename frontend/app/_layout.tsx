import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { appFontMap } from "@/src/theme/fonts";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { AppProvider } from "@/src/context/AppContext";
import { colors, fonts } from "@/src/theme/tokens";

// Disable logbox errors etc so that users can see the app.
LogBox.ignoreAllLogs(true);

// Keep the native splash visible from cold start until icon fonts register.
// Required because @expo/vector-icons' componentDidMount fallback fires
// Font.loadAsync against a broken vendor path if any <Icon> mounts before
// the family is registered — which throws on Android Expo Go.
SplashScreen.preventAutoHideAsync();

function BrandSplash() {
  return (
    <View style={styles.splash}>
      <Text style={styles.brand}>
        GIG<Text style={{ color: colors.brand }}>VERDICT</Text>
      </Text>
      <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
    </View>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === "login";
    if (!user && !inLogin) router.replace("/login");
    else if (user && inLogin) router.replace("/");
  }, [user, loading, segments, router]);

  if (loading) return <BrandSplash />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="verdict" options={{ presentation: "transparentModal", animation: "fade" }} />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      <Stack.Screen name="enter" options={{ presentation: "modal" }} />
      <Stack.Screen name="zone-edit" options={{ presentation: "modal" }} />
      <Stack.Screen name="goal" options={{ presentation: "modal" }} />
      <Stack.Screen name="live-capture" />
    </Stack>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts(appFontMap);
  const ready = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <StatusBar style="light" />
          <AuthProvider>
            <AppProvider>
              <Gate />
            </AppProvider>
          </AuthProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 44,
    letterSpacing: 2,
    color: colors.onSurface,
  },
});

// Auth context — Emergent-managed Google sign-in for Expo (mobile + web).
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { api, tokenStore } from "@/src/api/client";

WebBrowser.maybeCompleteAuthSession();

type User = { user_id: string; email: string; name?: string; picture?: string } | null;

type AuthState = {
  user: User;
  loading: boolean;
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

const AUTH_BASE = "https://auth.emergentagent.com/";

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const processed = useRef<Set<string>>(new Set());

  const exchange = useCallback(async (sessionId: string) => {
    if (processed.current.has(sessionId)) return;
    processed.current.add(sessionId);
    try {
      const res = await api.post<{ session_token: string; user: User }>("/auth/session", {
        session_id: sessionId,
      });
      await tokenStore.set(res.session_token);
      setUser(res.user);
    } catch {
      // silent — user stays on login
    } finally {
      setSigningIn(false);
    }
  }, []);

  const checkExisting = useCallback(async () => {
    const token = await tokenStore.load();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.get<{ user: User }>("/auth/me");
      setUser(res.user);
    } catch {
      await tokenStore.clear();
      setUser(null);
    }
  }, []);

  // Mount: process session_id first (web), then check existing session.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid =
            extractSessionId(window.location.hash) || extractSessionId(window.location.search);
          if (sid) {
            await exchange(sid);
            try {
              window.history.replaceState(
                window.history.state,
                "",
                window.location.pathname,
              );
            } catch {}
            if (mounted) setLoading(false);
            return;
          }
        } else {
          const initial = await Linking.getInitialURL();
          const sid = extractSessionId(initial);
          if (sid) await exchange(sid);
        }
        await checkExisting();
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSessionId(url);
      if (sid) exchange(sid);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [exchange, checkExisting]);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const redirect = window.location.origin + "/";
        window.location.href = `${AUTH_BASE}?redirect=${encodeURIComponent(redirect)}`;
        return;
      }
      const redirect = Linking.createURL("");
      const authUrl = `${AUTH_BASE}?redirect=${encodeURIComponent(redirect)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      let sid: string | null = null;
      if (result.type === "success" && result.url) sid = extractSessionId(result.url);
      if (!sid) sid = extractSessionId(await Linking.getInitialURL());
      if (sid) await exchange(sid);
      else setSigningIn(false);
    } catch {
      setSigningIn(false);
    }
  }, [exchange]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    await tokenStore.clear();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signingIn, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
